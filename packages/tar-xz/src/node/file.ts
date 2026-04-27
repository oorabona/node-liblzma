/**
 * File-based (disk I/O) helpers for tar.xz archives — Node.js only.
 *
 * These are convenience wrappers around the stream-first `create()`, `extract()`,
 * and `list()` APIs that read from and write to the filesystem directly.
 *
 * Do NOT import this module in browser bundles — it will fail clearly at runtime
 * since `node:fs` is not available in browser environments.
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, link, mkdir, symlink, unlink, utimes } from 'node:fs/promises';
import { dirname, normalize, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { CreateOptions, ExtractOptions, TarEntry } from '../types.js';
import { TarEntryType } from '../types.js';
import { create } from './create.js';
import { extract } from './extract.js';
import { list } from './list.js';

/**
 * Create a tar.xz archive on disk from a list of source files.
 *
 * @example
 * ```ts
 * await createFile('archive.tar.xz', {
 *   files: [
 *     { name: 'a.txt', source: '/local/a.txt' },
 *     { name: 'b/c.txt', source: Buffer.from('hello') },
 *   ],
 * });
 * ```
 */
export async function createFile(path: string, options: CreateOptions): Promise<void> {
  await pipeline(Readable.from(create(options)), createWriteStream(path));
}

/**
 * Extract a tar.xz archive from disk to a target directory.
 *
 * Honors `strip` and `filter` from options.
 *
 * Path safety: any entry attempting to escape the target directory (via "..") is
 * rejected with an error before any file is written.
 *
 * Symlinks and hardlinks are extracted. Other special entry types (device files,
 * FIFOs) are silently skipped.
 *
 * @param archivePath - Path to the `.tar.xz` file to extract
 * @param options     - Extraction options (`strip`, `filter`, `cwd`)
 */
export async function extractFile(
  archivePath: string,
  options: ExtractOptions & { cwd?: string } = {}
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const archiveStream = createReadStream(archivePath);

  for await (const entry of extract(archiveStream, options)) {
    const target = resolve(cwd, entry.name);
    const normalized = normalize(target);

    // Path safety: prevent directory traversal
    if (!normalized.startsWith(cwd + '/') && normalized !== cwd) {
      throw new Error(`Refusing to extract entry outside cwd: ${entry.name}`);
    }

    if (entry.type === TarEntryType.DIRECTORY) {
      // Ensure directory is traversable: always set execute bits (x) for user/group/other.
      // A directory with mode 0o644 (no execute) cannot be descended into.
      const dirMode = (entry.mode || 0o755) | 0o111;
      await mkdir(target, { recursive: true, mode: dirMode });
      continue;
    }

    if (entry.type === TarEntryType.SYMLINK) {
      await mkdir(dirname(target), { recursive: true });
      // Remove existing symlink if present (allow re-extract)
      try {
        await unlink(target);
      } catch {
        // Ignore — file may not exist
      }
      await symlink(entry.linkname, target);
      continue;
    }

    if (entry.type === TarEntryType.HARDLINK) {
      await mkdir(dirname(target), { recursive: true });
      const linkSource = resolve(cwd, entry.linkname);
      // Remove existing file if present (allow re-extract)
      try {
        await unlink(target);
      } catch {
        // Ignore
      }
      await link(linkSource, target);
      continue;
    }

    if (entry.type === TarEntryType.FILE) {
      await mkdir(dirname(target), { recursive: true });
      await pipeline(
        Readable.from(entry.data),
        createWriteStream(target, { mode: entry.mode || 0o644 })
      );
      // Restore file permissions (createWriteStream `mode` only sets at creation)
      try {
        await chmod(target, entry.mode || 0o644);
      } catch {
        // best effort
      }
      // Restore mtime
      if (entry.mtime > 0) {
        try {
          await utimes(target, entry.mtime, entry.mtime);
        } catch {
          // best effort
        }
      }
    }
    // Other entry types (CHARDEV, BLOCKDEV, FIFO, CONTIGUOUS) are skipped:
    // they require elevated privileges and have no portable cross-platform behavior.
  }
}

/**
 * List entries of a tar.xz archive on disk without extracting content.
 *
 * @param archivePath - Path to the `.tar.xz` file to inspect
 * @returns Array of entry metadata objects
 *
 * @example
 * ```ts
 * const entries = await listFile('archive.tar.xz');
 * for (const entry of entries) {
 *   console.log(entry.name, entry.size);
 * }
 * ```
 */
export async function listFile(archivePath: string): Promise<TarEntry[]> {
  const stream = createReadStream(archivePath);
  const entries: TarEntry[] = [];
  for await (const entry of list(stream)) {
    entries.push(entry);
  }
  return entries;
}
