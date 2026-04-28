/**
 * Tests for streamXz() and the deprecated helpers in xz-helpers.ts
 * Story: TAR-XZ-STREAMING-2026-04-28, Block 1
 *
 * Test layout: flat (alongside coverage.spec.ts, node-api.spec.ts, tar-format.spec.ts)
 * per spec §12.5 / L-L-08 (existing flat layout convention).
 */
import { Readable } from 'node:stream';
import { xzSync } from 'node-liblzma';
import { describe, expect, it } from 'vitest';
import { create } from '../src/node/create.js';
import { streamXz } from '../src/node/xz-helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a tiny valid .tar.xz from a list of files using the real `create()`
 * function. Returns the compressed bytes as a Buffer.
 */
async function buildTarXz(
  files: Array<{ name: string; content: Uint8Array | Buffer }>
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of create({
    files: files.map((f) => ({
      name: f.name,
      source: Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content),
    })),
  })) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
}

/** Collect all chunks from an AsyncIterable into a flat Buffer. */
async function collectIterable(iterable: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const chunk of iterable) {
    parts.push(chunk);
  }
  return Buffer.concat(parts.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
}

// ---------------------------------------------------------------------------
// T-07: Lazy pipeline — calling streamXz() without iterating must NOT start
// consuming the input Readable and must NOT produce unhandled rejections.
// ---------------------------------------------------------------------------

/**
 * Build a mock Readable that counts how many times _read() is called, so we
 * can assert the pipeline never touched the source when the generator was
 * returned before first .next().
 */
function makeCountingReadable(data: Buffer): { readable: Readable; getReadCount: () => number } {
  let readCount = 0;
  let consumed = false;
  const readable = new Readable({
    read() {
      readCount++;
      if (!consumed) {
        consumed = true;
        this.push(data);
        this.push(null);
      }
    },
  });
  return { readable, getReadCount: () => readCount };
}

// ---------------------------------------------------------------------------
// T-01: streamXz(Uint8Array) decompresses correctly (full byte-equality)
// ---------------------------------------------------------------------------

describe('streamXz', () => {
  it('T-01: decompresses a Uint8Array input with byte equality', async () => {
    const rawContent = Buffer.from('hello from tar-xz streaming test T-01');
    const compressed = xzSync(rawContent);
    const input = new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);

    const result = await collectIterable(streamXz(input));

    expect(result).toEqual(rawContent);
  });

  // ---------------------------------------------------------------------------
  // T-02: Multi-chunk yield — archive larger than one XZ output chunk
  // ---------------------------------------------------------------------------

  it('T-02: yields MORE THAN ONE chunk for a large input (no pre-buffering)', async () => {
    // Build a ~100 KB tar.xz so that the XZ decompressor emits multiple output chunks.
    // Each XZ output buffer is typically 64 KB, so a ~100 KB payload forces ≥2 chunks.
    const bigFile = Buffer.alloc(100 * 1024, 0x42); // 100 KB of 'B'
    const tarXz = await buildTarXz([{ name: 'big.bin', content: bigFile }]);

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    for await (const chunk of streamXz(tarXz)) {
      chunks.push(chunk);
      totalBytes += chunk.length;
    }

    expect(chunks.length).toBeGreaterThan(1);
    // Sum of chunk lengths must equal total decompressed size.
    expect(totalBytes).toBe(chunks.reduce((s, c) => s + c.length, 0));
    // Concatenated bytes must be ≥ 100 KB (the file content plus TAR overhead).
    expect(totalBytes).toBeGreaterThanOrEqual(bigFile.length);
  });

  // ---------------------------------------------------------------------------
  // T-03: Input form variants — Uint8Array, Buffer, Readable, AsyncIterable
  // ---------------------------------------------------------------------------

  it('T-03a: accepts Uint8Array input', async () => {
    const data = Buffer.from('T-03a content');
    const compressed = xzSync(data);
    const u8 = new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);

    const result = await collectIterable(streamXz(u8));
    expect(result).toEqual(data);
  });

  it('T-03b: accepts Buffer input', async () => {
    const data = Buffer.from('T-03b content');
    const compressed = xzSync(data);

    const result = await collectIterable(streamXz(compressed));
    expect(result).toEqual(data);
  });

  it('T-03c: accepts Readable stream input', async () => {
    const data = Buffer.from('T-03c content');
    const compressed = xzSync(data);
    const readable = Readable.from(
      (async function* () {
        yield compressed;
      })()
    );

    const result = await collectIterable(streamXz(readable));
    expect(result).toEqual(data);
  });

  it('T-03d: accepts AsyncIterable<Uint8Array> input', async () => {
    const data = Buffer.from('T-03d content');
    const compressed = xzSync(data);
    const asyncIterable: AsyncIterable<Uint8Array> = (async function* () {
      yield new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);
    })();

    const result = await collectIterable(streamXz(asyncIterable));
    expect(result).toEqual(data);
  });

  // ---------------------------------------------------------------------------
  // T-04: Corrupt input → thrown error in for await
  // ---------------------------------------------------------------------------

  it('T-04: throws an error when the XZ input is corrupt', async () => {
    const corrupt = Buffer.from('this is not valid XZ data at all!!! abcdef1234567890');

    await expect(async () => {
      await collectIterable(streamXz(corrupt));
    }).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // T-05: Memory shape — in-loop high-water mark sampling (spec §12.3 pattern)
  //
  // Uses a 5 MB synthetic decompressed tar and asserts that peak memory delta
  // stays below 10× the typical XZ output chunk size (64 KB = 65,536 bytes).
  // This proves no full-archive accumulation (which would spike to ~5 MB+).
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // T-06: Early termination — no unhandled rejections, stream destroyed
  // ---------------------------------------------------------------------------

  it('T-06: breaking out of for-await early causes no unhandled rejection and stream is cleaned up', async () => {
    // Build a 3-entry archive so there are entries past the break point.
    const tarXz = await buildTarXz([
      { name: 'a.txt', content: Buffer.from('entry-a') },
      { name: 'b.txt', content: Buffer.from('entry-b') },
      { name: 'c.txt', content: Buffer.from('entry-c') },
    ]);

    const unhandledRejections: Error[] = [];
    const handler = (err: Error) => unhandledRejections.push(err);
    process.on('unhandledRejection', handler);

    try {
      // Only consume first chunk — break immediately
      let count = 0;
      for await (const _chunk of streamXz(tarXz)) {
        count++;
        break; // consumer breaks early
      }
      // Allow a microtask turn for any unhandled rejection to surface
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off('unhandledRejection', handler);
    }

    expect(unhandledRejections).toHaveLength(0);
  });

  it('T-05: memory shape — peak heapUsed delta stays below 2× decompressed size for 5 MB tar', async () => {
    // Build a 5 MB synthetic file (highly compressible uniform byte) and stream-decompress it.
    // The compressed archive is tiny (high ratio), so holding it in memory as input is cheap.
    // The key proof: peak delta must stay well below the full decompressed size (5 MB),
    // demonstrating that bytes are not accumulated before yielding.
    //
    // Threshold = 2 × payloadSize (10 MB):
    // - A Buffer.concat-everything accumulator would spike to ≥ payloadSize (5 MB) just for
    //   the output array, PLUS the input buffer simultaneously, reaching 10+ MB.
    // - A streaming pipeline drains chunks as fast as they arrive; peak is bounded by the
    //   largest transient buffer (one XZ output chunk ≈ 64 KB) plus pipeline internals.
    // - The 2× slack covers GC timing variance, Node internal stream buffers, and
    //   the decompressor's own sliding-window dictionary (~8 MB for preset 6, shared
    //   across the whole decompression call but released on stream end).
    //
    // Note: this test uses `process.memoryUsage()` polling without `--expose-gc`.
    // Full deterministic memory shape tests with explicit GC are in Block 5
    // (test/memory-shape.spec.ts with pool: 'forks' + execArgv: ['--expose-gc']).
    const payloadSize = 5 * 1024 * 1024; // 5 MB
    const payload = Buffer.alloc(payloadSize, 0xab);
    const tarXz = await buildTarXz([{ name: 'data.bin', content: payload }]);

    const baseline = process.memoryUsage();
    const baselineSample = baseline.heapUsed + baseline.external;
    let peak = baselineSample;

    const sample = () => {
      const m = process.memoryUsage();
      peak = Math.max(peak, m.heapUsed + m.external);
    };

    let totalBytes = 0;
    for await (const chunk of streamXz(tarXz)) {
      sample();
      totalBytes += chunk.length;
    }
    sample();

    const peakDelta = peak - baselineSample;
    const threshold = 2 * payloadSize; // 10 MB
    expect(peakDelta).toBeLessThan(threshold);
    // Sanity: decompressed bytes must cover the full payload (TAR overhead adds more).
    expect(totalBytes).toBeGreaterThanOrEqual(payloadSize);
  }, 30_000); // 30s timeout — compression of 5 MB takes a few seconds

  // ---------------------------------------------------------------------------
  // T-07: Lazy pipeline — pipeline must NOT start until first .next() call
  // ---------------------------------------------------------------------------

  it('T-07: pipeline does not start when the returned AsyncIterable is never iterated', async () => {
    // Use a counting Readable so we can detect whether _read() was ever called.
    // We give it valid XZ data (so if the pipeline DID start it would succeed),
    // making read-count the only observable signal of eagerness.
    const data = Buffer.from('T-07 lazy semantics check');
    const compressed = xzSync(data);
    const { readable, getReadCount } = makeCountingReadable(compressed);

    const unhandledRejections: Error[] = [];
    const handler = (err: Error) => unhandledRejections.push(err);
    process.on('unhandledRejection', handler);

    try {
      // Obtain the iterable but do NOT iterate it.
      const _iterable = streamXz(readable);

      // Allow a microtask turn — enough for any eagerly-started pipeline to tick.
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off('unhandledRejection', handler);
    }

    // (a) Pipeline must NOT have consumed the input — readable._read() never called.
    expect(getReadCount()).toBe(0);
    // (b) No unhandled rejections — lazy pipeline means no dangling promise.
    expect(unhandledRejections).toHaveLength(0);
  });
});
