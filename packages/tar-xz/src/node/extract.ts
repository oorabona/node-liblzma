/**
 * Node.js TAR extraction with XZ decompression — v6 AsyncIterable API
 */

import { Writable } from 'node:stream';
import { calculatePadding } from '../tar/index.js';
import { stripPath } from '../tar/utils.js';
import type { TarInputNode } from '../internal/to-async-iterable.js';
import {
  type ExtractOptions,
  type TarEntry,
  type TarEntryWithData,
  TarEntryType,
} from '../types.js';
import { type HeaderParserState, parseNextHeader } from './tar-parser.js';
import { collectAllChunks, decompressXz, runWritable } from './xz-helpers.js';

/** Wrap a TarEntry + content Buffer into a TarEntryWithData. */
function makeTarEntryWithData(entry: TarEntry, content: Buffer): TarEntryWithData {
  const u8 = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);

  async function collectBytes(): Promise<Uint8Array> {
    return u8;
  }

  async function collectText(encoding?: string): Promise<string> {
    const bytes = await collectBytes();
    const enc = (encoding ?? 'utf-8') as BufferEncoding;
    return Buffer.from(bytes).toString(enc);
  }

  return {
    ...entry,
    data: (async function* () {
      if (u8.length > 0) yield u8;
    })(),
    bytes: collectBytes,
    text: collectText,
  };
}

/**
 * Transform stream that unpacks TAR format
 */
class TarUnpack extends Writable {
  private readonly state: HeaderParserState = {
    buffer: Buffer.alloc(0),
    paxAttrs: null,
    emptyBlockCount: 0,
  };
  private currentEntry: TarEntry | null = null;
  private bytesRemaining = 0;
  private paddingRemaining = 0;
  private contentChunks: Buffer[] = [];

  public entries: Array<TarEntry & { content: Buffer }> = [];

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.state.buffer = Buffer.concat([this.state.buffer, chunk]);

    try {
      this.processBuffer();
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  /** Skip padding bytes that follow a file's content blocks. */
  private skipPadding(): boolean {
    if (this.paddingRemaining <= 0) {
      return false;
    }
    const skip = Math.min(this.paddingRemaining, this.state.buffer.length);
    this.state.buffer = this.state.buffer.subarray(skip);
    this.paddingRemaining -= skip;
    return true;
  }

  /** Read file content bytes into `contentChunks`; finalize entry when done. */
  private readContent(): boolean {
    if (this.bytesRemaining <= 0 || !this.currentEntry) {
      return false;
    }
    const readSize = Math.min(this.bytesRemaining, this.state.buffer.length);
    this.contentChunks.push(this.state.buffer.subarray(0, readSize));
    this.state.buffer = this.state.buffer.subarray(readSize);
    this.bytesRemaining -= readSize;

    if (this.bytesRemaining === 0) {
      const content = Buffer.concat(this.contentChunks);
      this.entries.push({ ...this.currentEntry, content });
      this.paddingRemaining = calculatePadding(this.currentEntry.size);
      this.currentEntry = null;
      this.contentChunks = [];
    }
    return true;
  }

  /** Push a no-content entry (directory, symlink, hardlink, empty file). */
  private pushEmptyEntry(entry: TarEntry): void {
    this.entries.push({ ...entry, content: Buffer.alloc(0) });
  }

  /** Dispatch a parsed entry: push immediately or prepare for content read. */
  private handleEntry(entry: TarEntry): void {
    if (
      entry.type === TarEntryType.DIRECTORY ||
      entry.type === TarEntryType.SYMLINK ||
      entry.type === TarEntryType.HARDLINK ||
      entry.size === 0
    ) {
      this.pushEmptyEntry(entry);
      return;
    }
    this.currentEntry = entry;
    this.bytesRemaining = entry.size;
    this.contentChunks = [];
  }

  private processBuffer(): void {
    while (this.state.buffer.length > 0) {
      if (this.skipPadding()) continue;
      if (this.readContent()) continue;

      const result = parseNextHeader(this.state);
      if (result.action === 'need-more-data' || result.action === 'end-of-archive') break;
      if (result.action === 'pax-consumed') continue;
      this.handleEntry(result.entry);
    }
  }

  _final(callback: (error?: Error | null) => void): void {
    if (this.bytesRemaining > 0) {
      callback(new Error(`Unexpected end of archive, ${this.bytesRemaining} bytes remaining`));
    } else {
      callback();
    }
  }
}

/**
 * Validate that a path doesn't escape the target directory (path traversal protection)
 * @throws Error if path traversal is detected
 */

/**
 * Extract a tar.xz archive
 *
 * @param options - Extraction options
 * @returns Promise with list of extracted entries
 *
 * @example
 * ```ts
 * await extract({
 *   file: 'archive.tar.xz',
 *   cwd: '/dest',
 *   strip: 1
 * });
 * ```
 */
/**
 * Extract a tar.xz archive.
 *
 * Returns an `AsyncIterable<TarEntryWithData>`. Each yielded entry includes:
 * - Full metadata (`TarEntry` fields)
 * - `data` — `AsyncIterable<Uint8Array>` for the entry's content (consume in order)
 * - `bytes()` — helper that collects all chunks into a single `Uint8Array`
 * - `text(encoding?)` — helper that collects and decodes to a string
 *
 * @example
 * ```ts
 * for await (const entry of extract(input)) {
 *   const content = await entry.bytes();
 *   console.log(entry.name, content.length);
 * }
 * ```
 */
export async function* extract(
  input: TarInputNode,
  options: ExtractOptions = {}
): AsyncIterable<TarEntryWithData> {
  const { strip = 0, filter } = options;

  const chunks = await collectAllChunks(input);
  const tarData = await decompressXz(chunks);

  const tarUnpack = new TarUnpack();
  await runWritable(tarUnpack, tarData);

  for (const entry of tarUnpack.entries) {
    const strippedName = stripPath(entry.name, strip);
    if (!strippedName) {
      continue;
    }

    const strippedEntry = { ...entry, name: strippedName };
    if (filter && !filter(strippedEntry)) {
      continue;
    }

    const entryContent = entry.content;

    yield makeTarEntryWithData(strippedEntry, entryContent);
  }
}

/**
 * Extract archive to memory (no disk writes)
 */
// extractToMemory removed in v6 — use extract() with entry.bytes() instead
