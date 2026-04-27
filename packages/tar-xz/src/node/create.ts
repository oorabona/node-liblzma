/**
 * Node.js TAR creation with XZ compression — v6 AsyncIterable API
 */

import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { createXz } from 'node-liblzma';
import {
  calculatePadding,
  createEndOfArchive,
  createHeader,
  createPaxHeaderBlocks,
  needsPaxHeaders,
} from '../tar/index.js';
import type { CreateOptions, TarSourceFile } from '../types.js';
import { TarEntryType, type TarEntryTypeValue } from '../types.js';

/**
 * Transform stream that packs files into TAR format
 */
/**
 * Build a single TAR entry (header + content blocks) into an array of Uint8Array chunks.
 * Does not write to disk; caller decides what to do with the chunks.
 */
async function buildTarEntry(
  entryName: string,
  content: Uint8Array,
  size: number,
  mode: number,
  mtime: number,
  type: TarEntryTypeValue,
  linkname?: string
): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];

  let name = entryName;

  if (needsPaxHeaders({ name, size, linkname })) {
    const paxBlocks = createPaxHeaderBlocks(name, {
      path: name,
      size,
      linkpath: linkname,
    });
    chunks.push(...paxBlocks);
    // Truncate name for the regular header (PAX carries the full name)
    name = name.slice(-100);
  }

  const header = createHeader({
    name,
    type,
    size,
    mode,
    mtime,
    linkname,
  });

  chunks.push(header);

  if (size > 0) {
    chunks.push(content);
    const padding = calculatePadding(size);
    if (padding > 0) {
      chunks.push(new Uint8Array(padding));
    }
  }

  return chunks;
}

/**
 * Recursively collect all files in a directory
 */
/**
 * Resolve a TarSourceFile's `source` into a raw Uint8Array.
 * - string → interpreted as an fs path; file is read entirely into memory.
 * - Uint8Array/ArrayBuffer → used directly.
 * - AsyncIterable<Uint8Array> → all chunks are concatenated.
 */
async function resolveSource(file: TarSourceFile): Promise<Uint8Array> {
  const { source } = file;

  if (typeof source === 'string') {
    // Treat as fs path
    const buf = await fs.readFile(source);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
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
 * Build a raw (uncompressed) TAR byte stream from a list of source files.
 */
async function* buildTar(
  files: TarSourceFile[],
  filter: CreateOptions['filter']
): AsyncIterable<Uint8Array> {
  for (const file of files) {
    if (filter && !filter(file)) {
      continue;
    }

    const content = await resolveSource(file);
    const size = content.length;
    const name = file.name.replace(/\\/g, '/');
    const mtime = file.mtime
      ? Math.floor(file.mtime.getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    const isDir = name.endsWith('/') && size === 0;
    // M5: directories need execute bits to be traversable (0o755); files default to 0o644.
    const mode = file.mode ?? (isDir ? 0o755 : 0o644);
    const type: TarEntryTypeValue = isDir ? TarEntryType.DIRECTORY : TarEntryType.FILE;

    const entryChunks = await buildTarEntry(name, content, size, mode, mtime, type);
    for (const chunk of entryChunks) {
      yield chunk;
    }
  }
  yield createEndOfArchive();
}

/**
 * Create a tar.xz archive.
 *
 * Returns an `AsyncIterable<Uint8Array>` of compressed chunks. The output is
 * never written to disk — pipe it wherever you need:
 *
 * ```ts
 * const out = createWriteStream('archive.tar.xz');
 * await pipeline(Readable.from(create({ files })), out);
 * ```
 *
 * @param options - Creation options
 * @returns AsyncIterable of compressed XZ chunks
 */
export async function* create(options: CreateOptions): AsyncIterable<Uint8Array> {
  const { files, preset = 6, filter } = options;

  // Pipe TAR builder → XZ compressor; yield each compressed chunk as it arrives.
  // Node's Readable streams are themselves AsyncIterable, so we can `for await`
  // directly without buffering everything in memory.
  const xzStream = createXz({ preset });
  Readable.from(buildTar(files, filter)).pipe(xzStream);

  for await (const chunk of xzStream) {
    const buf = chunk as Buffer;
    yield new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
}
