/**
 * Shared Node.js helpers for XZ decompression pipelines.
 *
 * Used by both `list.ts` and `extract.ts` to avoid duplication.
 * These helpers depend on `node:stream` and are not suitable for browser bundles.
 */

import { Readable, type Writable } from 'node:stream';
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

/**
 * @deprecated Use {@link streamXz} for O(largest entry) streaming. Will be removed
 * once `extract.ts` and `list.ts` migrate to the streaming API (story TAR-XZ-STREAMING-2026-04-28).
 */
export async function collectAllChunks(input: TarInputNode): Promise<Uint8Array> {
  const iterable = toAsyncIterable(input);
  const chunks: Uint8Array[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * @deprecated Use {@link streamXz} for O(largest entry) streaming. Will be removed
 * once `extract.ts` and `list.ts` migrate to the streaming API (story TAR-XZ-STREAMING-2026-04-28).
 *
 * Decompress XZ data using the Node Transform stream.
 */
export async function decompressXz(data: Uint8Array): Promise<Uint8Array> {
  const unxzStream = createUnxz();
  const readable = Readable.from(
    (async function* () {
      yield data;
    })()
  );

  const output: Uint8Array[] = [];
  let resolveFlush!: () => void;
  let rejectFlush!: (e: unknown) => void;
  const done = new Promise<void>((res, rej) => {
    resolveFlush = res;
    rejectFlush = rej;
  });

  unxzStream.on('data', (...args: unknown[]) => {
    const chunk = args[0] as Buffer;
    output.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  });
  unxzStream.on('end', resolveFlush);
  unxzStream.on('error', rejectFlush);
  readable.pipe(unxzStream);

  await done;

  const total = output.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of output) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * @deprecated Use {@link streamXz} for O(largest entry) streaming. Will be removed
 * once `extract.ts` and `list.ts` migrate to the streaming API (story TAR-XZ-STREAMING-2026-04-28).
 *
 * Feed a Uint8Array into a Writable and wait for finish.
 */
export async function runWritable(writable: Writable, data: Uint8Array): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    writable.on('finish', resolve);
    writable.on('error', reject);
    writable.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    writable.end();
  });
}
