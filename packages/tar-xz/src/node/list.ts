/**
 * Node.js TAR listing with XZ decompression
 */

import { createReadStream } from 'node:fs';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createUnxz } from 'node-liblzma';
import { calculatePadding } from '../tar/index.js';
import type { ListOptions, TarEntry } from '../types.js';
import { type HeaderParserState, parseNextHeader } from './tar-parser.js';

/**
 * Writable stream that lists TAR entries without extracting content
 */
class TarList extends Writable {
  private readonly state: HeaderParserState = {
    buffer: Buffer.alloc(0),
    paxAttrs: null,
    emptyBlockCount: 0,
  };
  private bytesToSkip = 0;

  public entries: TarEntry[] = [];

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.state.buffer = Buffer.concat([this.state.buffer, chunk]);

    try {
      this.processBuffer();
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  /** Skip content and padding bytes for the current entry. */
  private skipBytes(): boolean {
    if (this.bytesToSkip <= 0) {
      return false;
    }
    const skip = Math.min(this.bytesToSkip, this.state.buffer.length);
    this.state.buffer = this.state.buffer.subarray(skip);
    this.bytesToSkip -= skip;
    return true;
  }

  /** Record entry and schedule content skip. */
  private handleEntry(entry: TarEntry): void {
    this.entries.push(entry);
    if (entry.size > 0) {
      this.bytesToSkip = entry.size + calculatePadding(entry.size);
    }
  }

  private processBuffer(): void {
    while (this.state.buffer.length > 0) {
      if (this.skipBytes()) continue;

      const result = parseNextHeader(this.state);
      if (result.action === 'need-more-data' || result.action === 'end-of-archive') break;
      if (result.action === 'pax-consumed') continue;
      this.handleEntry(result.entry);
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
