/**
 * Browser-based TAR extraction with XZ decompression — v6 AsyncIterable API
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
import { stripPath } from '../tar/utils.js';
import { toAsyncIterable } from '../internal/to-async-iterable.browser.js';
import {
  type ExtractOptions,
  type TarEntry,
  type TarEntryWithData,
  type TarInput,
  TarEntryType,
} from '../types.js';

/**
 * Parse TAR data into entries
 */

/**
 * Handle a PAX_HEADER block: parse its attributes and advance the offset.
 * Returns the updated offset and the parsed PAX attributes.
 */
function parsePaxHeaderBlock(
  data: Uint8Array,
  offset: number,
  size: number
): { offset: number; paxAttrs: PaxAttributes } {
  const paxData = data.subarray(offset, offset + size);
  const newOffset = offset + size + calculatePadding(size);
  return { offset: newOffset, paxAttrs: parsePaxData(paxData) };
}

/**
 * Extract entry content bytes and advance the offset past the content + padding.
 * Returns the updated offset and the content Uint8Array.
 */
function extractEntryContent(
  data: Uint8Array,
  offset: number,
  size: number
): { offset: number; contentData: Uint8Array } {
  const contentData = size > 0 ? data.subarray(offset, offset + size) : new Uint8Array(0);
  const newOffset = offset + size + calculatePadding(size);
  return { offset: newOffset, contentData };
}

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
      ({ offset, paxAttrs } = parsePaxHeaderBlock(data, offset, entry.size));
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
    let contentData: Uint8Array;
    ({ offset, contentData } = extractEntryContent(data, offset, entry.size));

    entries.push({ ...entry, data: contentData });
  }

  return entries;
}

/**
 * Extract a tar.xz archive (browser).
 *
 * Returns an `AsyncIterable<TarEntryWithData>`. Each yielded entry includes:
 * - Full metadata (`TarEntry` fields)
 * - `data` — `AsyncIterable<Uint8Array>` for the entry's content
 * - `bytes()` — helper that collects all chunks into a single `Uint8Array`
 * - `text(encoding?)` — helper that collects and decodes to a string
 *
 * @example
 * ```ts
 * for await (const entry of extract(archiveBytes)) {
 *   const content = await entry.bytes();
 *   console.log(entry.name, content.length);
 * }
 * ```
 */
export async function* extract(
  input: TarInput,
  options: ExtractOptions = {}
): AsyncIterable<TarEntryWithData> {
  const { strip = 0, filter } = options;

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

  // Parse TAR entries
  const entries = parseTar(tarData);

  for (const entry of entries) {
    const strippedName = stripPath(entry.name, strip);
    if (!strippedName) {
      continue;
    }

    const strippedEntry = { ...entry, name: strippedName };
    if (filter && !filter(strippedEntry)) {
      continue;
    }

    const entryData = entry.data;

    yield makeTarEntryWithData(strippedEntry, entryData);
  }
}

/** Wrap a TarEntry + data Uint8Array into a TarEntryWithData. */
function makeTarEntryWithData(entry: TarEntry, data: Uint8Array): TarEntryWithData {
  async function collectBytes(): Promise<Uint8Array> {
    return data;
  }

  async function collectText(encoding?: string): Promise<string> {
    const bytes = await collectBytes();
    if (typeof TextDecoder === 'undefined') {
      throw new Error('TextDecoder is not available in this environment');
    }
    return new TextDecoder(encoding ?? 'utf-8').decode(bytes);
  }

  return {
    ...entry,
    data: (async function* () {
      if (data.length > 0) yield data;
    })(),
    bytes: collectBytes,
    text: collectText,
  };
}
