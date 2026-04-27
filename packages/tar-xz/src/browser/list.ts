/**
 * Browser-based TAR listing with XZ decompression — v6 AsyncIterable API
 */

import { unxzAsync } from 'node-liblzma/wasm';
import {
  applyPaxAttributes,
  BLOCK_SIZE,
  calculatePadding,
  isEmptyBlock,
  parseHeader,
  parsePaxData,
} from '../tar/index.js';
import type { PaxAttributes } from '../tar/pax.js';
import { toAsyncIterable } from '../internal/to-async-iterable.browser.js';
import { type TarEntry, type TarInput, TarEntryType } from '../types.js';

/**
 * Parse TAR headers only (skip content)
 */
function listTarEntries(data: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let paxAttrs: PaxAttributes | null = null;
  let emptyBlockCount = 0;

  while (offset + BLOCK_SIZE <= data.length) {
    const headerBlock = data.subarray(offset, offset + BLOCK_SIZE);
    offset += BLOCK_SIZE;

    // Check for end-of-archive
    if (isEmptyBlock(headerBlock)) {
      emptyBlockCount++;
      if (emptyBlockCount >= 2) {
        break;
      }
      continue;
    }

    emptyBlockCount = 0;

    // Parse header
    let entry = parseHeader(headerBlock);
    if (!entry) {
      continue;
    }

    // Handle PAX headers
    if (entry.type === TarEntryType.PAX_HEADER) {
      const paxSize = entry.size;
      const paxData = data.subarray(offset, offset + paxSize);
      offset += paxSize + calculatePadding(paxSize);
      paxAttrs = parsePaxData(paxData);
      continue;
    }

    if (entry.type === TarEntryType.PAX_GLOBAL) {
      offset += entry.size + calculatePadding(entry.size);
      continue;
    }

    // Apply PAX attributes if present
    if (paxAttrs) {
      entry = applyPaxAttributes(entry, paxAttrs);
      paxAttrs = null;
    }

    // Skip content
    offset += entry.size + calculatePadding(entry.size);

    entries.push(entry);
  }

  return entries;
}

/**
 * List contents of a tar.xz archive in browser
 *
 * @param archive - Compressed archive data (ArrayBuffer or Uint8Array)
 * @returns Array of entry metadata (without content)
 *
 * @example
 * ```ts
 * const response = await fetch('archive.tar.xz');
 * const data = await response.arrayBuffer();
 * const entries = await listTarXz(data);
 *
 * for (const entry of entries) {
 *   console.log(entry.name, entry.size, entry.type);
 * }
 * ```
 */
/**
 * List the contents of a tar.xz archive (browser).
 *
 * Returns an `AsyncIterable<TarEntry>` yielding each entry's metadata.
 * Entry content is skipped — use `extract()` if you need the data.
 *
 * @example
 * ```ts
 * for await (const entry of list(archiveBytes)) {
 *   console.log(entry.name, entry.size, entry.type);
 * }
 * ```
 */
export async function* list(input: TarInput): AsyncIterable<TarEntry> {
  // Collect all input chunks
  const inputChunks: Uint8Array[] = [];
  for await (const chunk of toAsyncIterable(input)) {
    inputChunks.push(chunk);
  }
  const total = inputChunks.reduce((n, c) => n + c.length, 0);
  const archiveData = new Uint8Array(total);
  let off = 0;
  for (const chunk of inputChunks) {
    archiveData.set(chunk, off);
    off += chunk.length;
  }

  // Decompress XZ
  const tarData = await unxzAsync(archiveData);

  // List entries
  for (const entry of listTarEntries(tarData)) {
    yield entry;
  }
}
