/**
 * Node.js TAR extraction with XZ decompression
 */

import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createUnxz } from 'node-liblzma';
import { calculatePadding } from '../tar/index.js';
import { stripPath } from '../tar/utils.js';
import { type ExtractOptions, type TarEntry, TarEntryType } from '../types.js';
import { type HeaderParserState, parseNextHeader } from './tar-parser.js';

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
function validatePath(destPath: string, cwd: string): void {
  const resolvedDest = path.resolve(destPath);
  const resolvedCwd = path.resolve(cwd);

  // Ensure the destination path starts with the cwd (no escape via ../)
  if (!resolvedDest.startsWith(resolvedCwd + path.sep) && resolvedDest !== resolvedCwd) {
    throw new Error(`Path traversal detected: ${destPath} escapes ${cwd}`);
  }
}

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
export async function extract(options: ExtractOptions): Promise<TarEntry[]> {
  const { file, cwd = process.cwd(), strip = 0, filter, preserveOwner = false } = options;

  // Create decompression and unpacking streams
  const inputStream = createReadStream(file);
  const unxzStream = createUnxz();
  const tarUnpack = new TarUnpack();

  // Run pipeline
  await pipeline(inputStream, unxzStream, tarUnpack);

  // Extract files
  const extractedEntries: TarEntry[] = [];

  for (const entry of tarUnpack.entries) {
    // Apply strip
    const strippedName = stripPath(entry.name, strip);
    if (!strippedName) {
      continue;
    }

    // Apply filter
    const entryForFilter = { ...entry, name: strippedName };
    if (filter && !filter(entryForFilter)) {
      continue;
    }

    const destPath = path.join(cwd, strippedName);

    // Validate path doesn't escape cwd (path traversal protection)
    validatePath(destPath, cwd);

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(destPath), { recursive: true });

    if (entry.type === TarEntryType.DIRECTORY) {
      await fs.mkdir(destPath, { recursive: true });
    } else if (entry.type === TarEntryType.SYMLINK) {
      try {
        await fs.unlink(destPath);
      } catch {
        // Ignore if doesn't exist
      }
      await fs.symlink(entry.linkname, destPath);
    } else if (entry.type === TarEntryType.HARDLINK) {
      const linkDest = path.join(cwd, stripPath(entry.linkname, strip));
      try {
        await fs.unlink(destPath);
      } catch {
        // Ignore if doesn't exist
      }
      await fs.link(linkDest, destPath);
    } else {
      // Regular file
      await fs.writeFile(destPath, entry.content);
    }

    // Set permissions
    try {
      await fs.chmod(destPath, entry.mode);
    } catch {
      // Ignore permission errors
    }

    // Set ownership if requested and running as root
    /* v8 ignore start - requires root privileges to test */
    if (preserveOwner && process.getuid?.() === 0) {
      try {
        await fs.chown(destPath, entry.uid, entry.gid);
      } catch {
        // Ignore ownership errors
      }
    }
    /* v8 ignore stop */

    // Set modification time
    try {
      const mtime = new Date(entry.mtime * 1000);
      await fs.utimes(destPath, mtime, mtime);
    } catch {
      // Ignore time errors
    }

    extractedEntries.push(entryForFilter);
  }

  return extractedEntries;
}

/**
 * Extract archive to memory (no disk writes)
 */
export async function extractToMemory(
  file: string,
  options: { strip?: number; filter?: (entry: TarEntry) => boolean } = {}
): Promise<Array<TarEntry & { content: Buffer }>> {
  const { strip = 0, filter } = options;

  const inputStream = createReadStream(file);
  const unxzStream = createUnxz();
  const tarUnpack = new TarUnpack();

  await pipeline(inputStream, unxzStream, tarUnpack);

  return tarUnpack.entries
    .map((entry) => ({
      ...entry,
      name: stripPath(entry.name, strip),
    }))
    .filter((entry) => entry.name && (!filter || filter(entry)));
}
