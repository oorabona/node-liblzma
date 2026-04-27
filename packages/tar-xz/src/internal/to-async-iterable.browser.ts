/**
 * Normalize any TarInput to AsyncIterable<Uint8Array> — Browser version.
 *
 * Handles:
 * - AsyncIterable<Uint8Array>       → returned as-is
 * - Iterable<Uint8Array>            → wrapped in an async generator
 * - Uint8Array                      → yield once
 * - ArrayBuffer                     → wrap as Uint8Array, yield once
 * - ReadableStream<Uint8Array>      → Web Streams (for await...of via reader)
 *
 * NodeJS.ReadableStream is NOT supported in browsers.
 */

import type { TarInput } from '../types.js';

/**
 * Convert any supported input type to AsyncIterable<Uint8Array>.
 */
export function toAsyncIterable(input: TarInput): AsyncIterable<Uint8Array> {
  // Already async-iterable
  if (
    input != null &&
    typeof (input as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function'
  ) {
    return input as AsyncIterable<Uint8Array>;
  }

  // Web Streams ReadableStream
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

  // Uint8Array (and Buffer in Node, which is a Uint8Array subtype)
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
