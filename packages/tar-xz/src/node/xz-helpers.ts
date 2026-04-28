/**
 * Shared Node.js helpers for XZ decompression pipelines.
 *
 * `streamXz` is the primary entry point — used by `extract.ts` and `list.ts`.
 * These helpers depend on `node:stream` and are not suitable for browser bundles.
 */

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createUnxz } from 'node-liblzma';
import { toAsyncIterable, type TarInputNode } from '../internal/to-async-iterable.js';

/**
 * Decompress an XZ-compressed input stream incrementally, yielding raw tar bytes
 * as they arrive from the decompressor. No full-archive accumulation.
 *
 * Accepts any {@link TarInputNode}: `Uint8Array`, `Buffer`, `Readable`,
 * `AsyncIterable<Uint8Array>`, `ReadableStream<Uint8Array>`, or `ArrayBuffer`.
 *
 * The returned `AsyncIterable` is single-use. Errors (corrupt XZ, truncated
 * input) are thrown inside the `for await` loop.
 *
 * @example
 * ```ts
 * for await (const chunk of streamXz(input)) {
 *   processChunk(chunk);
 * }
 * ```
 */
export function streamXz(input: TarInputNode): AsyncIterable<Uint8Array> {
  // Convert any supported input type to an AsyncIterable<Uint8Array>.
  const source = toAsyncIterable(input);
  const unxzStream = createUnxz();

  // Feed the source into the Transform via pipeline() so that errors from the
  // input side (e.g. truncated readable) propagate and are not silently swallowed.
  // We do NOT await pipelinePromise here — iteration drives consumption below.
  const pipelinePromise = pipeline(Readable.from(source), unxzStream);

  // Iterate the Transform's own Symbol.asyncIterator directly (spec §12.5:
  // prefer this over Readable.from(transform) which adds another buffering layer).
  // Node's Transform implements Symbol.asyncIterator natively since Node 10.
  return (async function* () {
    try {
      for await (const chunk of unxzStream) {
        const buf = chunk as Buffer;
        yield new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      }
      // Surface any pipeline error (e.g. corrupt XZ, premature end of source).
      await pipelinePromise;
    } catch (err) {
      // Ensure the pipeline promise is always settled to avoid unhandled rejections.
      await pipelinePromise.catch(() => undefined);
      throw err;
    }
  })();
}
