/**
 * Node.js TAR creation with XZ compression
 */

import { promises as fs, type Stats } from 'node:fs';
import * as path from 'node:path';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createXz } from 'node-liblzma';
import {
  calculatePadding,
  createEndOfArchive,
  createHeader,
  createPaxHeaderBlocks,
  needsPaxHeaders,
} from '../tar/index.js';
import type { CreateOptions } from '../types.js';
import { TarEntryType, type TarEntryTypeValue } from '../types.js';

/**
 * Transform stream that packs files into TAR format
 */
class TarPack extends Transform {
  constructor() {
    super({ objectMode: false });
  }

  /**
   * Add a file entry to the archive
   */
  async addEntry(
    name: string,
    content: Buffer | null,
    stats: Stats,
    linkTarget?: string
  ): Promise<void> {
    const isDir = stats.isDirectory();
    const isSymlink = stats.isSymbolicLink();
    const size = isDir || isSymlink ? 0 : stats.size;

    // Normalize path (use forward slashes, add trailing slash for dirs)
    let entryName = name.replace(/\\/g, '/');
    if (isDir && !entryName.endsWith('/')) {
      entryName += '/';
    }

    // Determine type
    let type: TarEntryTypeValue = TarEntryType.FILE;
    if (isDir) {
      type = TarEntryType.DIRECTORY;
    } else if (isSymlink) {
      type = TarEntryType.SYMLINK;
    }

    // Check if PAX headers are needed
    if (needsPaxHeaders({ name: entryName, size, linkname: linkTarget })) {
      const paxBlocks = createPaxHeaderBlocks(entryName, {
        path: entryName,
        size,
        linkpath: linkTarget,
      });
      for (const block of paxBlocks) {
        this.push(block);
      }
      // Truncate name for the regular header (PAX has the full name)
      entryName = entryName.slice(-100);
    }

    // Create header
    const header = createHeader({
      name: entryName,
      type,
      size,
      mode: stats.mode & 0o7777,
      uid: stats.uid,
      gid: stats.gid,
      mtime: Math.floor(stats.mtimeMs / 1000),
      linkname: linkTarget,
    });

    this.push(header);

    // Write content for files
    if (content && size > 0) {
      this.push(content);

      // Add padding
      const padding = calculatePadding(size);
      if (padding > 0) {
        this.push(Buffer.alloc(padding));
      }
    }
  }

  /**
   * Finalize the archive with end-of-archive marker
   */
  finalize(): void {
    this.push(createEndOfArchive());
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    // Pass through any data pushed to us
    callback(null, chunk);
  }
}

/**
 * Recursively collect all files in a directory
 */
async function collectFiles(
  basePath: string,
  relativePath: string,
  follow: boolean
): Promise<Array<{ path: string; relativePath: string; stats: Stats }>> {
  const results: Array<{ path: string; relativePath: string; stats: Stats }> = [];
  const fullPath = path.join(basePath, relativePath);

  const stats = follow ? await fs.stat(fullPath) : await fs.lstat(fullPath);

  results.push({ path: fullPath, relativePath, stats });

  if (stats.isDirectory()) {
    const entries = await fs.readdir(fullPath);
    for (const entry of entries) {
      const childRelative = path.join(relativePath, entry);
      const childResults = await collectFiles(basePath, childRelative, follow);
      results.push(...childResults);
    }
  }

  return results;
}

/**
 * Create a tar.xz archive
 *
 * @param options - Creation options
 * @returns Promise that resolves when archive is complete
 *
 * @example
 * ```ts
 * await create({
 *   file: 'archive.tar.xz',
 *   cwd: '/source',
 *   files: ['file1.txt', 'dir/'],
 *   preset: 6
 * });
 * ```
 */
export async function create(options: CreateOptions): Promise<void> {
  const { file, cwd = process.cwd(), files, preset = 6, follow = false } = options;

  // Collect all files to archive
  const allFiles: Array<{ path: string; relativePath: string; stats: Stats }> = [];

  for (const filePattern of files) {
    const collected = await collectFiles(cwd, filePattern, follow);
    allFiles.push(...collected);
  }

  // Sort entries (directories before their contents)
  allFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Create streams
  const tarPack = new TarPack();
  const xzStream = createXz({ preset });
  const outputFile = await fs.open(file, 'w');
  const outputStream = outputFile.createWriteStream();

  // Process files
  const processFiles = async (): Promise<void> => {
    for (const { path: filePath, relativePath, stats } of allFiles) {
      let content: Buffer | null = null;
      let linkTarget: string | undefined;

      if (stats.isSymbolicLink()) {
        linkTarget = await fs.readlink(filePath);
      } else if (stats.isFile()) {
        content = await fs.readFile(filePath);
      }

      await tarPack.addEntry(relativePath, content, stats, linkTarget);
    }

    tarPack.finalize();
    tarPack.push(null); // End the stream
  };

  // Start processing and pipeline
  const processPromise = processFiles();

  await pipeline(tarPack, xzStream, outputStream);
  await processPromise;
  await outputFile.close();
}
