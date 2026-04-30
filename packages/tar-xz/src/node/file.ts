/**
 * File-based (disk I/O) helpers for tar.xz archives — Node.js only.
 *
 * These are convenience wrappers around the stream-first `create()`, `extract()`,
 * and `list()` APIs that read from and write to the filesystem directly.
 *
 * Do NOT import this module in browser bundles — it will fail clearly at runtime
 * since `node:fs` is not available in browser environments.
 */

import { createReadStream, createWriteStream, constants as fsConstants } from 'node:fs';
import { link, lstat, mkdir, open, symlink, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { CreateOptions, ExtractOptions, TarEntry, TarEntryWithData } from '../types.js';
import { TarEntryType } from '../types.js';
import { create } from './create.js';
import { extract } from './extract.js';
import { list } from './list.js';

/**
 * Strip setuid / setgid / sticky bits from extracted permissions.
 * Mirrors the GNU tar `--no-same-permissions` default — these bits have no
 * meaningful cross-platform semantics in an archive and are a security risk.
 */
const SAFE_MODE_MASK = 0o0777;

/**
 * Validate a tar entry name or linkname for safety.
 *
 * Rejects:
 *  - Empty strings (would cause target === cwd or ambiguous hardlink resolution)
 *  - Strings containing the NUL byte (U+0000)
 *  - Dot-segment-only names ('.', '..') that resolve to cwd or its parent
 */
function ensureSafeName(s: string | undefined, label: string): void {
  /* v8 ignore start: TS-defensive — callers only pass string (TarEntry.name/linkname are typed non-optional); undefined arm exists for future extensibility */
  if (s === undefined) return;
  /* v8 ignore stop */
  if (s.length === 0) throw new Error(`Refusing entry: empty ${label}`);
  /* v8 ignore start: unreachable via public API — TAR parser parseString() stops at the first NUL byte so no parsed entry name or linkname can ever contain U+0000 */
  if (s.includes('\x00')) throw new Error(`Refusing entry: ${label} contains NUL byte`);
  /* v8 ignore stop */
  // R7-1: reject names that are dot-segment-only after normalising separators.
  // './' → '.', '../' → '..', '.\' → '.' etc.
  const normalized = s.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalized === '.' || normalized === '..') {
    throw new Error(`Refusing entry: ${label} is a dot-segment placeholder ('${s}')`);
  }
}

/**
 * V6b: Validate `entry.linkname` for SYMLINK and HARDLINK entries.
 *
 * `TarEntry.linkname` is always present as a string (parser sets `''` for
 * empty link fields). Only SYMLINK and HARDLINK entries are required to have
 * non-empty linknames — other entry types may legitimately carry an empty
 * linkname. Delegates to `ensureSafeName` for the actual rejection logic
 * (empty-string + NUL-byte + dot-segment guards).
 */
function ensureSafeLinkname(entry: TarEntry): void {
  if (entry.type === TarEntryType.SYMLINK || entry.type === TarEntryType.HARDLINK) {
    ensureSafeName(entry.linkname, 'linkname');
  }
}

/**
 * S3 (TOCTOU guard): Check whether any ancestor directory of `filePath` (up to
 * but not including `root`) is a symlink. If so, a malicious archive could first
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
    } catch (err) {
      // ENOENT is fine — this intermediate dir doesn't exist yet, keep walking up.
      // A higher ancestor may still be a symlink.
      const code = (err as NodeJS.ErrnoException).code;
      /* v8 ignore start: race-window — ancestor dir deleted between lstat and dirname call; non-ENOENT errors (EACCES/EIO) are system-level and cannot be triggered in tests */
      if (code !== 'ENOENT') throw err;
      /* v8 ignore stop */
    }
    const parent = dirname(dir);
    /* v8 ignore start: filesystem-root invariant — dirname('/') === '/' on POSIX and dirname('C:\\') === 'C:\\' on Win32; loop cannot reach root in practice because tar entries are relative paths under cwd */
    if (parent === dir) break; // filesystem root reached
    /* v8 ignore stop */
    dir = parent;
  }
  return false;
}

/**
 * F-001 + F-002 + R6-1: Unified path-safety + TOCTOU + leaf-symlink check for any entry type.
 *
 * F-001: Correct traversal check — `rel === '..'` or `rel.startsWith('..' + sep)`.
 *   The old `rel.startsWith('..')` falsely rejects legitimate dotfiles like
 *   `'..gitignore'` or `'..config'` whose relative path happens to start with `..`.
 *
 * F-002: Extend TOCTOU symlink-ancestor check (was FILE-only) to cover DIRECTORY,
 *   SYMLINK, and HARDLINK entries — all of which call OS operations that follow
 *   symlink ancestors and can be exploited to escape cwd.
 *
 * R6-1 / V1: Leaf symlink check (controlled by `checkLeafSymlink`). If `target` is
 *   an existing symlink, reject immediately. Skip for SYMLINK entries — they
 *   explicitly unlink-then-recreate an existing symlink target (re-extract case).
 */
async function ensureSafeTarget(
  target: string,
  cwd: string,
  entryName: string,
  checkLeafSymlink = true
): Promise<void> {
  // F-001: safe traversal check — only reject when the relative path IS '..' or
  // starts with '../' (POSIX) / '..\' (Windows). Dotfiles like '..gitignore' are fine.
  const rel = relative(cwd, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Refusing to extract entry outside cwd: ${entryName}`);
  }
  // F-002: TOCTOU guard — reject if any ancestor directory is a symlink.
  if (await hasSymlinkAncestor(target, cwd)) {
    throw new Error(
      `Refusing to extract '${entryName}': a parent directory is a symlink (TOCTOU risk)`
    );
  }
  // R6-1 / V1: leaf symlink check — reject if the target path itself is an existing symlink.
  // This prevents a "plant symlink then overwrite via archive entry" attack.
  // Skipped for SYMLINK entries which intentionally replace an existing symlink via unlink().
  if (checkLeafSymlink) {
    try {
      const st = await lstat(target);
      if (st.isSymbolicLink()) {
        throw new Error(`Refusing '${entryName}': target path is an existing symlink`);
      }
    } catch (err) {
      /* v8 ignore start: race-window — target path disappears between the symlink check and lstat; non-ENOENT errors (EACCES/EIO) are system-level and cannot be triggered in tests */
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      /* v8 ignore stop */
    }
  }
}

/**
 * Write a SYMLINK entry to `target`.
 *
 * Applies `strip` to linkname if requested (V6c / V14), removes an existing
 * symlink if present (allow re-extract), then creates the new symlink.
 * Skips silently when strip removes the entire linkname (caller should
 * continue to next entry regardless — the skip-or-create decision is always
 * followed by `continue` in `extractFile`).
 *
 * Extracted from `extractFile` to reduce cognitive complexity; behavior is
 * byte-identical to the original inline SYMLINK branch.
 */
async function extractSymlinkEntry(
  target: string,
  entry: TarEntryWithData,
  strip: number
): Promise<void> {
  // S3 (TOCTOU): symlinks pointing outside cwd could be used to redirect
  // subsequent file writes (e.g. archive creates link→/etc, then writes link/file).
  // `entry.linkname` has already been syntactically validated upstream by
  // `ensureSafeLinkname()` (non-empty, no NUL byte, not a dot-segment placeholder).
  // What we do NOT enforce here is that the symlink target stays within `cwd` —
  // symlinks can legitimately point to relative paths inside the archive. The
  // TOCTOU risk comes from follow-up entries, which are guarded by
  // `ensureSafeTarget()` on each extraction target.

  // V6c / V14: apply strip to SYMLINK linkname, consistent with HARDLINK treatment.
  let strippedLinkname = entry.linkname;
  if (strip && strippedLinkname) {
    const parts = strippedLinkname.split('/').filter(Boolean);
    strippedLinkname = parts.slice(strip).join('/');
    if (!strippedLinkname) return; // stripped away — skip entry
  }

  await mkdir(dirname(target), { recursive: true });
  // Remove existing symlink if present (allow re-extract). Narrow catch to ENOENT only.
  try {
    await unlink(target);
  } catch (err) {
    /* v8 ignore start: race-window — existing symlink deleted between ensureSafeTarget check and unlink; non-ENOENT errors (EACCES/EIO) are system-level and cannot be triggered in tests */
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    /* v8 ignore stop */
  }
  await symlink(strippedLinkname, target);
}

/**
 * Write a HARDLINK entry to `target`.
 *
 * Applies `strip` to linkname, validates that the link source does not escape
 * `cwd`, rejects symlink sources (R5-1), checks for symlink ancestors (TOCTOU),
 * then creates the hardlink.
 * Skips silently when strip removes the entire linkname (caller should
 * continue to next entry regardless — the skip-or-create decision is always
 * followed by `continue` in `extractFile`).
 *
 * Extracted from `extractFile` to reduce cognitive complexity; behavior is
 * byte-identical to the original inline HARDLINK branch.
 */
async function extractHardlinkEntry(
  target: string,
  entry: TarEntryWithData,
  cwd: string,
  strip: number
): Promise<void> {
  // R4-2: apply the same strip logic to linkname as to entry.name, so that
  // hardlink targets are consistent with stripped extraction paths.
  let strippedLinkname = entry.linkname;
  if (strip && strippedLinkname) {
    const parts = strippedLinkname.split('/').filter(Boolean);
    strippedLinkname = parts.slice(strip).join('/');
    if (!strippedLinkname) return; // link target stripped away — skip entry
  }
  // S2: validate linkname — it must not escape cwd (absolute paths or ".." segments).
  const linkSource = resolve(cwd, strippedLinkname);
  const linkRel = relative(cwd, linkSource);
  if (linkRel === '..' || linkRel.startsWith(`..${sep}`) || isAbsolute(linkRel)) {
    throw new Error(`Refusing hardlink outside cwd: ${entry.linkname}`);
  }
  // R5-1: reject if linkSource itself is a symlink — the kernel would follow it
  // and create a hardlink to whatever the symlink points to (possibly outside cwd).
  // ENOENT is fine (linkname may point to a not-yet-extracted file); rethrow others.
  let linkSrcStat: Awaited<ReturnType<typeof lstat>> | null = null;
  try {
    linkSrcStat = await lstat(linkSource);
  } catch (err) {
    /* v8 ignore start: race-window — link source deleted between existence check and lstat; non-ENOENT errors (EACCES/EIO) are system-level and cannot be triggered in tests */
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    /* v8 ignore stop */
  }
  if (linkSrcStat?.isSymbolicLink()) {
    throw new Error(
      `Refusing hardlink: source '${entry.linkname}' is a symlink (would resolve outside cwd)`
    );
  }
  // R5-1: reject if any ancestor of linkSource is a symlink (TOCTOU risk).
  if (await hasSymlinkAncestor(linkSource, cwd)) {
    throw new Error(
      `Refusing hardlink: source '${entry.linkname}' has a symlink ancestor (TOCTOU risk)`
    );
  }
  await mkdir(dirname(target), { recursive: true });
  // Remove existing file if present (allow re-extract). Narrow catch to ENOENT only.
  try {
    await unlink(target);
  } catch (err) {
    /* v8 ignore start: race-window — target disappears between existence check and unlink; benign ENOENT in concurrent extraction */
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    /* v8 ignore stop */
  }
  await link(linkSource, target);
}

/**
 * POSIX implementation of FILE entry write (used by `writeFileEntry`).
 *
 * Opens with `O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW`. `O_NOFOLLOW`
 * prevents opening a symlink at the leaf — if `ensureSafeTarget` somehow
 * missed one, the OS rejects it here (V2 / V3).
 * `chmod` and `utimes` are fd-based and strict (errors propagate).
 * `handle.close()` is always called in `finally`.
 */
async function writeFileEntryPosix(
  target: string,
  entry: TarEntryWithData,
  fileMode: number
): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(
      target,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW,
      fileMode
    );
  } catch (err) {
    /* v8 ignore start: race-window — O_NOFOLLOW fires only if ensureSafeTarget missed a symlink in the TOCTOU gap; unreachable under normal test conditions */
    if ((err as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error(`Refusing '${entry.name}': target path is an existing symlink (O_NOFOLLOW)`);
    }
    /* v8 ignore stop */
    throw err;
  }
  try {
    // Collect all chunks from the async generator and write via fd.
    // Using direct handle.write() calls avoids stream lifecycle issues
    // with autoClose:false + pipeline in some Node versions.
    for await (const chunk of entry.data) {
      await handle.write(chunk as Uint8Array);
    }
    // fd-based chmod and utimes — do NOT follow symlinks (and there can't be one:
    // O_NOFOLLOW would have errored on open).
    await handle.chmod(fileMode);
    if (entry.mtime > 0) {
      const mt = new Date(entry.mtime * 1000);
      await handle.utimes(mt, mt);
    }
  } finally {
    await handle.close();
  }
}

/**
 * Open `target` with 'wx' (O_CREAT | O_EXCL — atomic exclusive create) for
 * the Win32 FILE entry write path.
 *
 * Strategy:
 *   1. Attempt `open(target, 'wx', fileMode)`.
 *   2. On `EEXIST` (target exists — legitimate overwrite): unlink then retry.
 *      - Ignore `ENOENT` on unlink (target disappeared between attempts — OK).
 *   3. If the retry also fails with `EEXIST`, a symlink/junction was injected
 *      between our unlink and our retry-open. Throw fail-closed security error.
 *
 * This implements the W1 → W2 window closure from WIN32-TOCTOU-2026-04-29 §3.
 * The returned `FileHandle` is exclusively created — no by-path swap can occur
 * on writes via the handle.
 */
async function openFileExclusive(
  target: string,
  entryName: string,
  fileMode: number
): Promise<Awaited<ReturnType<typeof open>>> {
  try {
    return await open(target, 'wx', fileMode);
  } catch (firstErr) {
    /* v8 ignore start: race-window — non-EEXIST errors from first open() (e.g., EACCES, ENOSPC) are system-level and cannot be triggered in tests; PR #114 Win32 TOCTOU hardening */
    if ((firstErr as NodeJS.ErrnoException).code !== 'EEXIST') throw firstErr;
    /* v8 ignore stop */
    // Target exists — legitimate overwrite: unlink then retry.
    // If the target disappears between the failed open() and unlink(), ignore
    // ENOENT and still retry the atomic exclusive create.
    try {
      await unlink(target);
    } catch (unlinkErr) {
      /* v8 ignore start: race-window — target disappears between failed open() and unlink(); PR #114 Win32 TOCTOU hardening */
      if ((unlinkErr as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkErr;
      /* v8 ignore stop */
    }
    try {
      return await open(target, 'wx', fileMode);
    } catch (retryErr) {
      /* v8 ignore start: race-window — TOCTOU injection between unlink and retry-open; PR #114 Win32 TOCTOU hardening, locked by adversarial review */
      if ((retryErr as NodeJS.ErrnoException).code === 'EEXIST') {
        // A symlink (or junction) was injected between our unlink and our open.
        // Fail-closed: do NOT write through the symlink.
        throw new Error(
          `Security error: target still exists on retry for '${entryName}' — ` +
            `possible symlink/junction injection or concurrent creation at the target path between unlink and open`
        );
      }
      /* v8 ignore stop */
      /* v8 ignore start: Win32 TOCTOU retry path — rethrow non-EEXIST errors from retry-open; reachable only if the second open() fails with an unexpected errno (e.g., EACCES from a sudden permission change between unlink and re-open) */
      throw retryErr;
      /* v8 ignore stop */
    }
  }
}

/**
 * Windows implementation of FILE entry write (used by `writeFileEntry`).
 *
 * Opens exclusively via `openFileExclusive` ('wx' + unlink+retry fail-closed),
 * then writes all chunks via fd, then does best-effort fd-based chmod/utimes.
 * `handle.close()` is always called in `finally`.
 *
 * Threat model (W1-W4 per WIN32-TOCTOU-2026-04-29 §3):
 *   W1: lstat check → open()    ~ms    CLOSED by 'wx' atomic create
 *   W2: open() → last byte      per-chunk streaming window → CLOSED by 'wx' fd
 *   W3: last byte → chmod       ~ms    CLOSED: fd-based handle.chmod()
 *   W4: chmod → utimes          ~ms    CLOSED: fd-based handle.utimes()
 * See SECURITY.md§"Windows symlink-swap TOCTOU" for the full reparse-tag table.
 */
async function writeFileEntryWin32(
  target: string,
  entry: TarEntryWithData,
  fileMode: number
): Promise<void> {
  const handle = await openFileExclusive(target, entry.name, fileMode);
  try {
    // Write all chunks via fd — by-path swap after open() cannot redirect writes.
    for await (const chunk of entry.data) {
      await handle.write(chunk as Uint8Array);
    }
    // fd-based chmod and utimes to avoid any by-path follow after write.
    // On Windows these metadata updates are best-effort: some filesystems can
    // reject them (for example with EPERM) even when the file contents were
    // written successfully.
    /* v8 ignore start: Windows best-effort — chmod/utimes can fail with EPERM on some filesystems; platform-specific defensive branch */
    try {
      await handle.chmod(fileMode);
    } catch {
      // Best-effort on Windows.
    }
    /* v8 ignore stop */
    if (entry.mtime > 0) {
      const mt = new Date(entry.mtime * 1000);
      /* v8 ignore start: Windows best-effort — utimes can fail with EPERM on some filesystems; platform-specific defensive branch */
      try {
        await handle.utimes(mt, mt);
      } catch {
        // Best-effort on Windows.
      }
      /* v8 ignore stop */
    }
  } finally {
    await handle.close();
  }
}

/**
 * Write a FILE entry to `target` using fd-based I/O.
 *
 * Dispatches to `writeFileEntryPosix` (O_NOFOLLOW) or `writeFileEntryWin32`
 * ('wx' atomic-create + unlink+retry fail-closed) based on `process.platform`.
 * See the per-platform helpers for the full TOCTOU threat model documentation.
 *
 * @param target   - Validated absolute target path (caller has already run `ensureSafeTarget`)
 * @param entry    - The tar entry (used for `entry.name`, `entry.data`, `entry.mtime`)
 * @param fileMode - Mode already masked with `SAFE_MODE_MASK` (setuid/setgid/sticky stripped)
 */
async function writeFileEntry(
  target: string,
  entry: TarEntryWithData,
  fileMode: number
): Promise<void> {
  if (process.platform !== 'win32') {
    await writeFileEntryPosix(target, entry, fileMode);
  } else {
    await writeFileEntryWin32(target, entry, fileMode);
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
 * Path safety: refuses entries that escape `cwd` via "..", absolute paths,
 * or pre-existing symlinks (leaf or ancestor). Hardlink linkSources are
 * also validated.
 *
 * Threat model: assumes `cwd` is exclusively owned by this process for the
 * duration of the call. Race conditions where a concurrent attacker process
 * swaps ancestors during extraction are mitigated differently per platform:
 *
 * @security
 * **POSIX (Linux, macOS):** FILE entries are written via
 * `open(O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW)` + fd-based `write()` /
 * `chmod()` / `utimes()`. `O_NOFOLLOW` prevents opening a symlink at the leaf
 * path. The fd is held open for the entire content write, so the TOCTOU window
 * is bounded to the gap between `ensureSafeTarget` and the `open()` call —
 * effectively zero in practice.
 *
 * **Windows:** `O_NOFOLLOW` is not available. The Windows path uses
 * `open(target, 'wx', mode)` (atomic exclusive create — `O_CREAT | O_EXCL`).
 * If the target exists (`EEXIST`), it is unlinked and the open is retried.
 * If the retry also fails with `EEXIST`, a symlink was injected between the
 * unlink and the retry-open (symlink-swap race) and extraction fails closed
 * with a security error. All write/chmod/utimes ops are fd-based (via
 * `FileHandle`) so no by-path symlink follow can occur after the open.
 * The residual race is limited to the `open()` syscall itself (sub-microsecond).
 * See `SECURITY.md§"Windows symlink-swap TOCTOU"` for the full reparse-tag
 * coverage table and user mitigations.
 *
 * **Windows recommendation:** extract to a directory owned exclusively by the
 * calling process — do not extract user-supplied archives into shared or
 * world-writable directories. For untrusted archives on Windows, prefer WSL.
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
  const strip = options.strip ?? 0;

  for await (const entry of extract(archiveStream, options)) {
    // V6a / V6b: reject empty or NUL-containing names/linknames early, before any path math.
    ensureSafeName(entry.name, 'name');
    ensureSafeLinkname(entry);

    const target = resolve(cwd, entry.name);

    // F-001 + F-002: path-safety + TOCTOU check for all entry types.
    // R6-1 / V1: leaf symlink check is also applied here, EXCEPT for SYMLINK entries
    // which intentionally unlink-then-recreate an existing symlink target (re-extract case).
    await ensureSafeTarget(target, cwd, entry.name, entry.type !== TarEntryType.SYMLINK);

    if (entry.type === TarEntryType.DIRECTORY) {
      // Ensure directory is traversable: always set execute bits (x) for user/group/other.
      // A directory with mode 0o644 (no execute) cannot be descended into.
      // V12: strip setuid/setgid/sticky bits (mask to SAFE_MODE_MASK) then restore traversability.
      const dirMode = ((entry.mode ?? 0o755) & SAFE_MODE_MASK) | 0o111;
      await mkdir(target, { recursive: true, mode: dirMode });
      continue;
    }

    if (entry.type === TarEntryType.SYMLINK) {
      await extractSymlinkEntry(target, entry, strip);
      continue;
    }

    if (entry.type === TarEntryType.HARDLINK) {
      await extractHardlinkEntry(target, entry, cwd, strip);
      continue;
    }

    if (entry.type === TarEntryType.FILE) {
      await mkdir(dirname(target), { recursive: true });

      // V12: strip setuid/setgid/sticky bits from file mode.
      const fileMode = (entry.mode ?? 0o644) & SAFE_MODE_MASK;

      // V2 / V3: use file-descriptor-based extraction to eliminate the TOCTOU window
      // between write and chmod/utimes. See `writeFileEntry` for the platform-specific
      // POSIX (O_NOFOLLOW) and Windows ('wx' atomic-create + unlink+retry) strategies.
      await writeFileEntry(target, entry, fileMode);
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
