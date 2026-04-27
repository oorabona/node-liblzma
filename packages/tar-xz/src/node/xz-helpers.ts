/**
 * Shared Node.js helpers for XZ decompression pipelines.
 *
 * Used by both `list.ts` and `extract.ts` to avoid duplication.
 * These helpers depend on `node:stream` and are not suitable for browser bundles.
 */

import { Readable, type Writable } from 'node:stream';
import { createUnxz } from 'node-liblzma';
import { toAsyncIterable, type TarInputNode } from '../internal/to-async-iterable.js';

/** Collect all chunks from any TarInputNode into a single Uint8Array. */
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

/** Decompress XZ data using the Node Transform stream. */
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

/** Feed a Uint8Array into a Writable and wait for finish. */
export async function runWritable(writable: Writable, data: Uint8Array): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    writable.on('finish', resolve);
    writable.on('error', reject);
    writable.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    writable.end();
  });
}
