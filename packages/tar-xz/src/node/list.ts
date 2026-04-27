/**
 * Node.js TAR listing with XZ decompression — v6 AsyncIterable API
 */

import { Writable } from 'node:stream';
import { calculatePadding } from '../tar/index.js';
import type { TarInputNode } from '../internal/to-async-iterable.js';
import type { TarEntry } from '../types.js';
import { type HeaderParserState, parseNextHeader } from './tar-parser.js';
import { collectAllChunks, decompressXz, runWritable } from './xz-helpers.js';

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
 * List the contents of a tar.xz archive.
 *
 * Returns an `AsyncIterable<TarEntry>` yielding each entry's metadata.
 * Entry content is skipped — use `extract()` if you need the data.
 *
 * @example
 * ```ts
 * for await (const entry of list(input)) {
 *   console.log(entry.name, entry.size);
 * }
 * ```
 */
export async function* list(input: TarInputNode): AsyncIterable<TarEntry> {
  const chunks = await collectAllChunks(input);
  const tarData = await decompressXz(chunks);

  const tarList = new TarList();
  await runWritable(tarList, tarData);

  for (const entry of tarList.entries) {
    yield entry;
  }
}
