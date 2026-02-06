/**
 * Browser-based TAR creation with XZ compression
 */

import { xzAsync } from 'node-liblzma';
import {
  calculatePadding,
  createEndOfArchive,
  createHeader,
  createPaxHeaderBlocks,
  needsPaxHeaders,
} from '../tar/index.js';
import { type BrowserCreateOptions, TarEntryType } from '../types.js';

/**
 * Convert input content to Uint8Array
 */
async function toUint8Array(
  content: string | Uint8Array | ArrayBuffer | Blob
): Promise<Uint8Array> {
  if (typeof content === 'string') {
    return new TextEncoder().encode(content);
  }
  if (content instanceof Uint8Array) {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }
  if (content instanceof Blob) {
    const buffer = await content.arrayBuffer();
    return new Uint8Array(buffer);
  }
  throw new Error('Unsupported content type');
}

/**
 * Concatenate multiple Uint8Arrays
 */
function concatArrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Create a tar.xz archive in browser
 *
 * @param options - Creation options
 * @returns Compressed archive as Uint8Array
 *
 * @example
 * ```ts
 * const archive = await createTarXz({
 *   files: [
 *     { name: 'hello.txt', content: 'Hello, World!' },
 *     { name: 'data.json', content: JSON.stringify({ foo: 'bar' }) }
 *   ],
 *   preset: 3
 * });
 *
 * // Download the archive
 * const blob = new Blob([archive], { type: 'application/x-xz' });
 * const url = URL.createObjectURL(blob);
 * ```
 */
export async function createTarXz(options: BrowserCreateOptions): Promise<Uint8Array> {
  const { files, preset = 3 } = options;

  const blocks: Uint8Array[] = [];

  for (const file of files) {
    const content = await toUint8Array(file.content);
    const size = content.length;

    // Normalize name
    let name = file.name.replace(/\\/g, '/');

    // Determine if it's a directory (ends with / and has no content)
    const isDir = name.endsWith('/') && size === 0;
    const type = isDir ? TarEntryType.DIRECTORY : TarEntryType.FILE;

    // Check if PAX headers are needed
    if (needsPaxHeaders({ name, size })) {
      const paxBlocks = createPaxHeaderBlocks(name, {
        path: name,
        size,
      });
      blocks.push(...paxBlocks);
      // Truncate name for the regular header
      name = name.slice(-100);
    }

    // Create header
    const mtime = file.mtime
      ? typeof file.mtime === 'number'
        ? file.mtime
        : Math.floor(file.mtime.getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const header = createHeader({
      name,
      type,
      size,
      mode: file.mode ?? (isDir ? 0o755 : 0o644),
      mtime,
    });

    blocks.push(header);

    // Add content
    if (size > 0) {
      blocks.push(content);

      // Add padding
      const padding = calculatePadding(size);
      if (padding > 0) {
        blocks.push(new Uint8Array(padding));
      }
    }
  }

  // Add end-of-archive marker
  blocks.push(createEndOfArchive());

  // Concatenate all blocks into TAR
  const tarData = concatArrays(blocks);

  // Compress with XZ
  // Cast to any because WASM accepts Uint8Array but types are defined for Node.js Buffer
  return xzAsync(tarData as unknown as Parameters<typeof xzAsync>[0], { preset });
}
