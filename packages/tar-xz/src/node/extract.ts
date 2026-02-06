/**
 * Node.js TAR extraction with XZ decompression
 */

import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
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
import { type ExtractOptions, type TarEntry, TarEntryType } from '../types.js';

/**
 * Transform stream that unpacks TAR format
 */
class TarUnpack extends Writable {
  private buffer: Buffer = Buffer.alloc(0);
  private currentEntry: TarEntry | null = null;
  private bytesRemaining = 0;
  private paddingRemaining = 0;
  private contentChunks: Buffer[] = [];
  private paxAttrs: PaxAttributes | null = null;
  private emptyBlockCount = 0;

  public entries: Array<TarEntry & { content: Buffer }> = [];

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
      // Handle padding
      if (this.paddingRemaining > 0) {
        const skip = Math.min(this.paddingRemaining, this.buffer.length);
        this.buffer = this.buffer.subarray(skip);
        this.paddingRemaining -= skip;
        continue;
      }

      // Handle file content
      if (this.bytesRemaining > 0 && this.currentEntry) {
        const readSize = Math.min(this.bytesRemaining, this.buffer.length);
        this.contentChunks.push(this.buffer.subarray(0, readSize));
        this.buffer = this.buffer.subarray(readSize);
        this.bytesRemaining -= readSize;

        // Entry complete
        if (this.bytesRemaining === 0) {
          const content = Buffer.concat(this.contentChunks);
          this.entries.push({ ...this.currentEntry, content });

          // Calculate padding
          this.paddingRemaining = calculatePadding(this.currentEntry.size);
          this.currentEntry = null;
          this.contentChunks = [];
        }
        continue;
      }

      // Need a full block for header
      if (this.buffer.length < BLOCK_SIZE) {
        break;
      }

      const headerBlock = this.buffer.subarray(0, BLOCK_SIZE);
      this.buffer = this.buffer.subarray(BLOCK_SIZE);

      // Check for end-of-archive
      if (isEmptyBlock(headerBlock)) {
        this.emptyBlockCount++;
        if (this.emptyBlockCount >= 2) {
          // End of archive
          break;
        }
        continue;
      }

      this.emptyBlockCount = 0;

      // Parse header
      let entry = parseHeader(headerBlock);
      if (!entry) {
        continue;
      }

      // Handle PAX headers
      if (entry.type === TarEntryType.PAX_HEADER) {
        // Read PAX data
        const paxSize = entry.size;
        const paxPadding = calculatePadding(paxSize);
        const totalNeeded = paxSize + paxPadding;

        if (this.buffer.length < totalNeeded) {
          // Put header back and wait for more data
          this.buffer = Buffer.concat([headerBlock, this.buffer]);
          break;
        }

        const paxData = this.buffer.subarray(0, paxSize);
        this.buffer = this.buffer.subarray(paxSize + paxPadding);
        this.paxAttrs = parsePaxData(paxData);
        continue;
      }

      if (entry.type === TarEntryType.PAX_GLOBAL) {
        // Skip global PAX headers (we don't support them yet)
        const skipSize = entry.size + calculatePadding(entry.size);
        if (this.buffer.length < skipSize) {
          this.buffer = Buffer.concat([headerBlock, this.buffer]);
          break;
        }
        this.buffer = this.buffer.subarray(skipSize);
        continue;
      }

      // Apply PAX attributes if present
      if (this.paxAttrs) {
        entry = applyPaxAttributes(entry, this.paxAttrs);
        this.paxAttrs = null;
      }

      // Handle directories (no content)
      if (entry.type === TarEntryType.DIRECTORY) {
        this.entries.push({ ...entry, content: Buffer.alloc(0) });
        continue;
      }

      // Handle symlinks (no content)
      if (entry.type === TarEntryType.SYMLINK || entry.type === TarEntryType.HARDLINK) {
        this.entries.push({ ...entry, content: Buffer.alloc(0) });
        continue;
      }

      // Regular file - prepare to read content
      if (entry.size > 0) {
        this.currentEntry = entry;
        this.bytesRemaining = entry.size;
        this.contentChunks = [];
      } else {
        this.entries.push({ ...entry, content: Buffer.alloc(0) });
      }
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
    if (preserveOwner && process.getuid?.() === 0) {
      try {
        await fs.chown(destPath, entry.uid, entry.gid);
      } catch {
        // Ignore ownership errors
      }
    }

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
