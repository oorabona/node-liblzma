/**
 * Normalize any TarInput to AsyncIterable<Uint8Array> — Node.js version.
 *
 * Handles:
 * - AsyncIterable<Uint8Array>       → returned as-is
 * - Iterable<Uint8Array>            → wrapped in an async generator
 * - Uint8Array                      → yield once
 * - ArrayBuffer                     → wrap as Uint8Array, yield once
 * - ReadableStream<Uint8Array>      → Web Streams (for await...of)
 * - NodeJS.ReadableStream           → Readable.from() makes it AsyncIterable
 */

import { Readable } from 'node:stream';
import type { TarInput } from '../types.js';

/** Node-extended TarInput that also accepts Node Readable streams */
export type TarInputNode = TarInput | NodeJS.ReadableStream;

/**
 * Convert any supported input type to AsyncIterable<Uint8Array>.
 */
export function toAsyncIterable(input: TarInputNode): AsyncIterable<Uint8Array> {
  // Already async-iterable (covers AsyncIterable and Node Readable which
  // implements Symbol.asyncIterator in Node 10+)
  if (
    input != null &&
    typeof (input as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function'
  ) {
    // If it's a Node Readable, wrap via Readable.from to ensure Uint8Array chunks
    if (input instanceof Readable) {
      return Readable.from(input) as unknown as AsyncIterable<Uint8Array>;
    }
    return input as AsyncIterable<Uint8Array>;
  }

  // Web Streams ReadableStream — Node 18+ supports for-await-of on ReadableStream
  // but typing differs; use the reader API for safety
  if (input != null && typeof (input as ReadableStream<Uint8Array>).getReader === 'function') {
    return webReadableToAsyncIterable(input as ReadableStream<Uint8Array>);
  }

  // Sync iterable (Iterable<Uint8Array>)
  if (input != null && typeof (input as Iterable<Uint8Array>)[Symbol.iterator] === 'function') {
    const iterable = input as Iterable<Uint8Array>;
    return (async function* () {
      for (const chunk of iterable) {
        yield chunk;
      }
    })();
  }

  // ArrayBuffer — wrap as Uint8Array
  if (input instanceof ArrayBuffer) {
    const u8 = new Uint8Array(input);
    return (async function* () {
      yield u8;
    })();
  }

  // Uint8Array (and Buffer, which is a Uint8Array subtype)
  if (input instanceof Uint8Array) {
    const u8 = input;
    return (async function* () {
      yield u8;
    })();
  }

  throw new TypeError(`toAsyncIterable: unsupported input type: ${typeof input}`);
}

async function* webReadableToAsyncIterable(
  stream: ReadableStream<Uint8Array>
): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
