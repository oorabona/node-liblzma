/**
 * Browser-based TAR creation with XZ compression — v6 AsyncIterable API
 */

import { xzAsync } from 'node-liblzma/wasm';
import {
  calculatePadding,
  createEndOfArchive,
  createHeader,
  createPaxHeaderBlocks,
  needsPaxHeaders,
} from '../tar/index.js';
import {
  type CreateOptions,
  type TarSourceFile,
  TarEntryType,
  type TarEntryTypeValue,
} from '../types.js';

/**
 * Convert input content to Uint8Array
 */
/**
 * Resolve a TarSourceFile's source to Uint8Array.
 * Strings (fs paths) are not supported in browsers and throw an error.
 */
async function resolveSource(file: TarSourceFile): Promise<Uint8Array> {
  const { source } = file;

  if (typeof source === 'string') {
    throw new Error(
      `tar-xz: TarSourceFile.source is a string (fs path), which is not supported in browsers. ` +
        `Pass a Uint8Array or AsyncIterable<Uint8Array> instead.`
    );
  }

  if (source instanceof Uint8Array) {
    return source;
  }

  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }

  // AsyncIterable<Uint8Array> — collect chunks
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) {
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
 * Build TAR blocks for a single file and push them into `out`.
 */
async function buildFileBlocks(file: TarSourceFile, out: Uint8Array[]): Promise<void> {
  const content = await resolveSource(file);
  const size = content.length;
  let name = file.name.replace(/\\/g, '/');
  const mtime = file.mtime
    ? Math.floor(file.mtime.getTime() / 1000)
    : Math.floor(Date.now() / 1000);
  const mode = file.mode ?? 0o644;
  const isDir = name.endsWith('/') && size === 0;
  const type: TarEntryTypeValue = isDir ? TarEntryType.DIRECTORY : TarEntryType.FILE;

  if (needsPaxHeaders({ name, size })) {
    out.push(...createPaxHeaderBlocks(name, { path: name, size }));
    name = name.slice(-100);
  }

  out.push(createHeader({ name, type, size, mode, mtime }));

  if (size > 0) {
    out.push(content);
    const padding = calculatePadding(size);
    if (padding > 0) out.push(new Uint8Array(padding));
  }
}

/**
 * Concatenate Uint8Array blocks into a single buffer.
 */
function concatBlocks(blocks: Uint8Array[]): Uint8Array {
  const totalLength = blocks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}

/**
 * Create a tar.xz archive (browser).
 *
 * Returns an `AsyncIterable<Uint8Array>` of compressed chunks.
 *
 * @example
 * ```ts
 * const chunks: Uint8Array[] = [];
 * for await (const chunk of create({ files })) {
 *   chunks.push(chunk);
 * }
 * const blob = new Blob(chunks, { type: 'application/x-xz' });
 * ```
 */
export async function* create(options: CreateOptions): AsyncIterable<Uint8Array> {
  const { files, preset = 6, filter } = options;

  const blocks: Uint8Array[] = [];
  for (const file of files) {
    if (filter && !filter(file)) continue;
    await buildFileBlocks(file, blocks);
  }
  blocks.push(createEndOfArchive());

  const compressed = await xzAsync(concatBlocks(blocks), { preset });
  yield compressed;
}
