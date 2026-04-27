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
import { chmod, link, lstat, mkdir, symlink, unlink, utimes } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { CreateOptions, ExtractOptions, TarEntry } from '../types.js';
import { TarEntryType } from '../types.js';
import { create } from './create.js';
import { extract } from './extract.js';
import { list } from './list.js';

/**
 * S3 (TOCTOU guard): Check whether any ancestor directory of `filePath` (up to
 * and including `root`) is a symlink. If so, a malicious archive could first
 * plant a symlink pointing outside root, then write a file through it.
 *
 * Returns true if a symlink ancestor is found (caller should reject the entry).
 */
async function hasSymlinkAncestor(filePath: string, root: string): Promise<boolean> {
  // Walk each ancestor from filePath up to (but not including) root.
  let dir = dirname(filePath);
  while (dir !== root && dir.length >= root.length) {
    try {
      const st = await lstat(dir);
      if (st.isSymbolicLink()) return true;
    } catch {
      // Directory doesn't exist yet — no symlink risk.
      return false;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root reached
    dir = parent;
  }
  return false;
}

/**
 * F-001 + F-002: Unified path-safety + TOCTOU check for any entry type.
 *
 * F-001: Correct traversal check — `rel === '..'` or `rel.startsWith('..' + sep)`.
 *   The old `rel.startsWith('..')` falsely rejects legitimate dotfiles like
 *   `'..gitignore'` or `'..config'` whose relative path happens to start with `..`.
 *
 * F-002: Extend TOCTOU symlink-ancestor check (was FILE-only) to cover DIRECTORY,
 *   SYMLINK, and HARDLINK entries — all of which call OS operations that follow
 *   symlink ancestors and can be exploited to escape cwd.
 */
async function ensureSafeTarget(target: string, cwd: string, entryName: string): Promise<void> {
  // F-001: safe traversal check — only reject when the relative path IS '..' or
  // starts with '../' (POSIX) / '..\' (Windows). Dotfiles like '..gitignore' are fine.
  const rel = relative(cwd, target);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error(`Refusing to extract entry outside cwd: ${entryName}`);
  }
  // F-002: TOCTOU guard — reject if any ancestor directory is a symlink.
  if (await hasSymlinkAncestor(target, cwd)) {
    throw new Error(
      `Refusing to extract '${entryName}': a parent directory is a symlink (TOCTOU risk)`
    );
  }
}

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

    // F-001 + F-002: unified path-safety + TOCTOU check applied to ALL entry types.
    await ensureSafeTarget(target, cwd, entry.name);

    if (entry.type === TarEntryType.DIRECTORY) {
      // Ensure directory is traversable: always set execute bits (x) for user/group/other.
      // A directory with mode 0o644 (no execute) cannot be descended into.
      const dirMode = (entry.mode || 0o755) | 0o111;
      await mkdir(target, { recursive: true, mode: dirMode });
      continue;
    }

    if (entry.type === TarEntryType.SYMLINK) {
      // S3 (TOCTOU): symlinks pointing outside cwd could be used to redirect
      // subsequent file writes (e.g. archive creates link→/etc, then writes link/file).
      // We do NOT validate entry.linkname here because symlinks can legitimately
      // point to relative paths inside the archive; the TOCTOU risk comes from
      // follow-up entries — those are guarded by ensureSafeTarget() on each entry.
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
      // S2: validate linkname — it must not escape cwd (absolute paths or ".." segments).
      const linkSource = resolve(cwd, entry.linkname);
      const linkRel = relative(cwd, linkSource);
      if (linkRel === '..' || linkRel.startsWith('..' + sep) || isAbsolute(linkRel)) {
        throw new Error(`Refusing hardlink outside cwd: ${entry.linkname}`);
      }
      await mkdir(dirname(target), { recursive: true });
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
