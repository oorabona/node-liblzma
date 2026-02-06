/**
 * Browser-based TAR extraction with XZ decompression
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
import {
  type BrowserExtractOptions,
  type ExtractedFile,
  type TarEntry,
  TarEntryType,
} from '../types.js';

/**
 * Parse TAR data into entries
 */
function parseTar(data: Uint8Array): Array<TarEntry & { data: Uint8Array }> {
  const entries: Array<TarEntry & { data: Uint8Array }> = [];
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

    // Extract content
    const contentData =
      entry.size > 0 ? data.subarray(offset, offset + entry.size) : new Uint8Array(0);

    offset += entry.size + calculatePadding(entry.size);

    entries.push({ ...entry, data: contentData });
  }

  return entries;
}

/**
 * Strip leading path components from a path
 */
function stripPath(filePath: string, strip: number): string {
  if (strip <= 0) {
    return filePath;
  }

  const parts = filePath.split('/');
  return parts.slice(strip).join('/');
}

/**
 * Extract a tar.xz archive in browser
 *
 * @param archive - Compressed archive data (ArrayBuffer or Uint8Array)
 * @param options - Extraction options
 * @returns Array of extracted files
 *
 * @example
 * ```ts
 * const response = await fetch('archive.tar.xz');
 * const data = await response.arrayBuffer();
 * const files = await extractTarXz(data);
 *
 * for (const file of files) {
 *   console.log(file.name, file.data.length);
 * }
 * ```
 */
export async function extractTarXz(
  archive: ArrayBuffer | Uint8Array,
  options: BrowserExtractOptions = {}
): Promise<ExtractedFile[]> {
  const { strip = 0, filter } = options;

  // Convert to Uint8Array if needed
  const archiveData = archive instanceof Uint8Array ? archive : new Uint8Array(archive);

  // Decompress XZ
  // Cast to any because WASM accepts Uint8Array but types are defined for Node.js Buffer
  const tarData = await unxzAsync(archiveData as unknown as Parameters<typeof unxzAsync>[0]);

  // Parse TAR
  const entries = parseTar(tarData);

  // Apply strip and filter
  const results: ExtractedFile[] = [];

  for (const entry of entries) {
    const strippedName = stripPath(entry.name, strip);
    if (!strippedName) {
      continue;
    }

    const strippedEntry = { ...entry, name: strippedName };

    if (filter && !filter(strippedEntry)) {
      continue;
    }

    results.push({
      name: strippedName,
      data: entry.data,
      entry: strippedEntry,
    });
  }

  return results;
}
