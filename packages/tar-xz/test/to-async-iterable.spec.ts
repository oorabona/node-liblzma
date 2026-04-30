/**
 * Tests for to-async-iterable.ts (Node) and to-async-iterable.browser.ts (Browser).
 *
 * Both files use only Web APIs + node:stream (Node variant), so they are
 * testable directly in Node 18+ without JSDOM.
 * ReadableStream is available on globalThis since Node 18.
 */
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { toAsyncIterable as toAsyncIterableBrowser } from '../src/internal/to-async-iterable.browser.js';
import { toAsyncIterable as toAsyncIterableNode } from '../src/internal/to-async-iterable.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function drain(iter: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of iter) {
    chunks.push(chunk);
  }
  return chunks;
}

function makeReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++] as Uint8Array);
      } else {
        controller.close();
      }
    },
  });
}

/**
 * Build a minimal Web-Streams-compatible reader that does NOT implement
 * Symbol.asyncIterator. Node 18+ ReadableStream has asyncIterator so it
 * takes the AsyncIterable fast-path and never reaches the getReader() branch.
 * This fake forces the code down the getReader() path.
 */
function makeGetReaderOnlyStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  const fake = {
    getReader(): ReadableStreamDefaultReader<Uint8Array> {
      return {
        read: async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
          if (index < chunks.length) {
            return { done: false, value: chunks[index++] as Uint8Array };
          }
          return { done: true, value: undefined };
        },
        releaseLock: () => {},
        cancel: async () => {},
        closed: Promise.resolve(undefined),
      } as unknown as ReadableStreamDefaultReader<Uint8Array>;
    },
  };
  // Explicitly remove asyncIterator so the code uses getReader() path
  return fake as unknown as ReadableStream<Uint8Array>;
}

// ---------------------------------------------------------------------------
// Shared contracts — run for both Node and Browser implementations
// ---------------------------------------------------------------------------

describe.each([
  { fn: toAsyncIterableNode, label: 'Node' },
  { fn: toAsyncIterableBrowser, label: 'Browser' },
])('toAsyncIterable — $label', ({ fn }) => {
  it('Uint8Array → yields single chunk with identical bytes', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const chunks = await drain(fn(data));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(data);
  });

  it('Buffer → yields single chunk (Buffer is Uint8Array subtype)', async () => {
    const buf = Buffer.from([10, 20, 30]);
    const chunks = await drain(fn(buf));
    expect(chunks).toHaveLength(1);
    // Buffer is a Uint8Array — bytes must match
    expect(Array.from(chunks[0] as Uint8Array)).toEqual([10, 20, 30]);
  });

  it('ArrayBuffer → wraps as Uint8Array, yields single chunk', async () => {
    const ab = new ArrayBuffer(3);
    new Uint8Array(ab).set([7, 8, 9]);
    const chunks = await drain(fn(ab));
    expect(chunks).toHaveLength(1);
    expect(Array.from(chunks[0] as Uint8Array)).toEqual([7, 8, 9]);
  });

  it('Iterable<Uint8Array> → yields each chunk in order', async () => {
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    const c = new Uint8Array([3]);

    function* gen(): Iterable<Uint8Array> {
      yield a;
      yield b;
      yield c;
    }

    const chunks = await drain(fn(gen()));
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual(a);
    expect(chunks[1]).toEqual(b);
    expect(chunks[2]).toEqual(c);
  });

  it('AsyncIterable<Uint8Array> → pass-through, yields all chunks', async () => {
    const expected = [new Uint8Array([11]), new Uint8Array([22])];

    async function* source(): AsyncIterable<Uint8Array> {
      for (const chunk of expected) {
        yield chunk;
      }
    }

    const chunks = await drain(fn(source()));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual(expected[0]);
    expect(chunks[1]).toEqual(expected[1]);
  });

  it('ReadableStream<Uint8Array> — single chunk → yields via reader API (getReader-only)', async () => {
    // Use a fake stream with getReader but no Symbol.asyncIterator to force
    // the webReadableToAsyncIterable() code path in both implementations.
    const data = new Uint8Array([42, 43, 44]);
    const stream = makeGetReaderOnlyStream([data]);
    const chunks = await drain(fn(stream as unknown as Parameters<typeof fn>[0]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(data);
  });

  it('ReadableStream<Uint8Array> — multi-chunk → accumulates all chunks in order (getReader-only)', async () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const c = new Uint8Array([5, 6]);
    const stream = makeGetReaderOnlyStream([a, b, c]);
    const chunks = await drain(fn(stream as unknown as Parameters<typeof fn>[0]));
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual(a);
    expect(chunks[1]).toEqual(b);
    expect(chunks[2]).toEqual(c);
  });

  it('empty Uint8Array → yields a single zero-length chunk', async () => {
    const empty = new Uint8Array(0);
    const chunks = await drain(fn(empty));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(0);
  });

  it('empty ArrayBuffer → yields a single zero-length Uint8Array', async () => {
    const ab = new ArrayBuffer(0);
    const chunks = await drain(fn(ab));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBeInstanceOf(Uint8Array);
    expect(chunks[0]).toHaveLength(0);
  });

  it('empty Iterable → yields nothing', async () => {
    function* empty(): Iterable<Uint8Array> {
      // intentionally empty
    }
    const chunks = await drain(fn(empty()));
    expect(chunks).toHaveLength(0);
  });

  it('empty AsyncIterable → yields nothing', async () => {
    async function* empty(): AsyncIterable<Uint8Array> {
      // intentionally empty
    }
    const chunks = await drain(fn(empty()));
    expect(chunks).toHaveLength(0);
  });

  it('empty ReadableStream → yields nothing (getReader-only)', async () => {
    const stream = makeGetReaderOnlyStream([]);
    const chunks = await drain(fn(stream as unknown as Parameters<typeof fn>[0]));
    expect(chunks).toHaveLength(0);
  });

  // -- Error contract --------------------------------------------------------

  it('null → throws TypeError', async () => {
    expect(() => fn(null as unknown as Parameters<typeof fn>[0])).toThrow(TypeError);
    expect(() => fn(null as unknown as Parameters<typeof fn>[0])).toThrow(
      'toAsyncIterable: unsupported input type: object'
    );
  });

  it('number → throws TypeError', async () => {
    expect(() => fn(42 as unknown as Parameters<typeof fn>[0])).toThrow(TypeError);
    expect(() => fn(42 as unknown as Parameters<typeof fn>[0])).toThrow(
      'toAsyncIterable: unsupported input type: number'
    );
  });

  // Note: strings are NOT rejected — they satisfy Symbol.iterator (Iterable branch)
  // and are passed through as iterable of characters. This is the current contract.
  it('string → treated as Iterable (character iterator), does NOT throw', async () => {
    // A string satisfies Symbol.iterator, so it is dispatched to the Iterable branch.
    // Each yielded "chunk" is a single-character string cast to Uint8Array.
    // We only verify that no TypeError is thrown and at least one chunk is yielded.
    const iter = fn('hi' as unknown as Parameters<typeof fn>[0]);
    const chunks = await drain(iter);
    expect(chunks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Node-only: Node Readable streams
// ---------------------------------------------------------------------------

describe('toAsyncIterable — Node-only (Readable)', () => {
  it('Readable.from(array) → yields each chunk', async () => {
    const a = Buffer.from([1, 2]);
    const b = Buffer.from([3, 4]);
    const readable = Readable.from([a, b]);
    const chunks = await drain(toAsyncIterableNode(readable));
    expect(chunks).toHaveLength(2);
    expect(Array.from(chunks[0] as Uint8Array)).toEqual([1, 2]);
    expect(Array.from(chunks[1] as Uint8Array)).toEqual([3, 4]);
  });

  it('Readable from a single Buffer → yields that buffer', async () => {
    const data = Buffer.from('hello world');
    const readable = Readable.from([data]);
    const chunks = await drain(toAsyncIterableNode(readable));
    expect(chunks).toHaveLength(1);
    expect(Buffer.concat(chunks.map((c) => Buffer.from(c))).toString()).toBe('hello world');
  });

  it('empty Readable → yields nothing', async () => {
    const readable = Readable.from([]);
    const chunks = await drain(toAsyncIterableNode(readable));
    expect(chunks).toHaveLength(0);
  });

  it('Readable is wrapped via Readable.from (not returned as-is)', async () => {
    // The Node implementation explicitly wraps Node Readable via Readable.from()
    // even though Readable implements Symbol.asyncIterator.
    // Verify the contract: result must be a valid AsyncIterable yielding Uint8Array.
    const buf = new Uint8Array([99, 100, 101]);
    const readable = Readable.from([buf]);
    const result = toAsyncIterableNode(readable);
    // Must not be the same reference as the readable (it was wrapped)
    expect(result).not.toBe(readable);
    const chunks = await drain(result);
    expect(chunks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Browser implementation does NOT accept Node Readable streams.
// Confirm that a plain object with Symbol.asyncIterator IS accepted as-is.
// ---------------------------------------------------------------------------

describe('toAsyncIterable — Browser-only contract', () => {
  it('custom AsyncIterable object → returned as-is (no Readable.from wrapping)', async () => {
    const data = new Uint8Array([55, 66]);
    const iterable: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        let done = false;
        return {
          next: async () => {
            if (!done) {
              done = true;
              return { value: data, done: false };
            }
            return { value: undefined as unknown as Uint8Array, done: true };
          },
        };
      },
    };

    const result = toAsyncIterableBrowser(iterable);
    // Browser returns the exact same reference for AsyncIterables (no wrapping)
    expect(result).toBe(iterable);
    const chunks = await drain(result);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(data);
  });
});
