/**
 * Node.js TAR listing with XZ decompression
 */

import { createReadStream } from 'node:fs';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createUnxz } from 'node-liblzma';
import {
  applyPaxAttributes,
  BLOCK_SIZE,
  calculatePadding,
  isEmptyBlock,
  parseHeader,
  parsePaxData,
} from '../tar/index.js';
import type { PaxAttributes } from '../tar/pax.js';
import { type ListOptions, type TarEntry, TarEntryType } from '../types.js';

/**
 * Writable stream that lists TAR entries without extracting content
 */
class TarList extends Writable {
  private buffer: Buffer = Buffer.alloc(0);
  private bytesToSkip = 0;
  private paxAttrs: PaxAttributes | null = null;
  private emptyBlockCount = 0;

  public entries: TarEntry[] = [];

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    try {
      this.processBuffer();
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  private processBuffer(): void {
    while (this.buffer.length > 0) {
      // Skip content and padding
      if (this.bytesToSkip > 0) {
        const skip = Math.min(this.bytesToSkip, this.buffer.length);
        this.buffer = this.buffer.subarray(skip);
        this.bytesToSkip -= skip;
        continue;
      }

      // Need a full block for header
      /* v8 ignore start - streaming edge case: chunk boundary splits a 512-byte block */
      if (this.buffer.length < BLOCK_SIZE) {
        break;
      }
      /* v8 ignore stop */

      const headerBlock = this.buffer.subarray(0, BLOCK_SIZE);
      this.buffer = this.buffer.subarray(BLOCK_SIZE);

      // Check for end-of-archive
      if (isEmptyBlock(headerBlock)) {
        this.emptyBlockCount++;
        if (this.emptyBlockCount >= 2) {
          break;
        }
        continue;
      }

      this.emptyBlockCount = 0;

      // Parse header
      let entry = parseHeader(headerBlock);
      /* v8 ignore start - dead code: empty blocks filtered above, parseHeader only returns null for empty */
      if (!entry) {
        continue;
      }
      /* v8 ignore stop */

      // Handle PAX headers
      if (entry.type === TarEntryType.PAX_HEADER) {
        const paxSize = entry.size;
        const paxPadding = calculatePadding(paxSize);
        const totalNeeded = paxSize + paxPadding;

        /* v8 ignore start - streaming edge case: PAX data split across XZ chunks */
        if (this.buffer.length < totalNeeded) {
          this.buffer = Buffer.concat([headerBlock, this.buffer]);
          break;
        }
        /* v8 ignore stop */

        const paxData = this.buffer.subarray(0, paxSize);
        this.buffer = this.buffer.subarray(paxSize + paxPadding);
        this.paxAttrs = parsePaxData(paxData);
        continue;
      }

      if (entry.type === TarEntryType.PAX_GLOBAL) {
        this.bytesToSkip = entry.size + calculatePadding(entry.size);
        continue;
      }

      // Apply PAX attributes if present
      if (this.paxAttrs) {
        entry = applyPaxAttributes(entry, this.paxAttrs);
        this.paxAttrs = null;
      }

      // Add entry to list
      this.entries.push(entry);

      // Skip content
      if (entry.size > 0) {
        this.bytesToSkip = entry.size + calculatePadding(entry.size);
      }
    }
  }

  _final(callback: (error?: Error | null) => void): void {
    callback();
  }
}

/**
 * List contents of a tar.xz archive
 *
 * @param options - List options
 * @returns Promise with list of entries
 *
 * @example
 * ```ts
 * const entries = await list({ file: 'archive.tar.xz' });
 * for (const entry of entries) {
 *   console.log(entry.name, entry.size);
 * }
 * ```
 */
export async function list(options: ListOptions): Promise<TarEntry[]> {
  const { file } = options;

  const inputStream = createReadStream(file);
  const unxzStream = createUnxz();
  const tarList = new TarList();

  await pipeline(inputStream, unxzStream, tarList);

  return tarList.entries;
}
