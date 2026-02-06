/**
 * Browser-based TAR listing with XZ decompression
 */

import { unxzAsync } from 'node-liblzma';
import {
  applyPaxAttributes,
  BLOCK_SIZE,
  calculatePadding,
  isEmptyBlock,
  parseHeader,
  parsePaxData,
} from '../tar/index.js';
import type { PaxAttributes } from '../tar/pax.js';
import { type TarEntry, TarEntryType } from '../types.js';

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
export async function listTarXz(archive: ArrayBuffer | Uint8Array): Promise<TarEntry[]> {
  // Convert to Uint8Array if needed
  const archiveData = archive instanceof Uint8Array ? archive : new Uint8Array(archive);

  // Decompress XZ
  // Cast to any because WASM accepts Uint8Array but types are defined for Node.js Buffer
  const tarData = await unxzAsync(archiveData as unknown as Parameters<typeof unxzAsync>[0]);

  // List entries
  return listTarEntries(tarData);
}
