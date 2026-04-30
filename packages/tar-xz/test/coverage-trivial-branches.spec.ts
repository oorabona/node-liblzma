/**
 * PR-δ: trivial branch coverage for packages/tar-xz/src/node/file.ts
 *
 * Targets three partial-branch lines identified in post-PR-β coverage report:
 *  - file.ts:287  `if (entry.mtime > 0)` — false branch (mtime === 0)
 *  - file.ts:519  `if (entry.type === TarEntryType.FILE)` — truthy branch explicit dispatch
 *  - file.ts:523  `(entry.mode ?? 0o644)` — mode=0 path (file created with mode 0 & SAFE_MODE_MASK)
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { xzSync } from 'node-liblzma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractFile } from '../src/node/file.js';
import { calculatePadding, createEndOfArchive, createHeader } from '../src/tar/format.js';
import { TarEntryType } from '../src/types.js';

// ---------------------------------------------------------------------------
// Local TAR builder (mirrors the helper in coverage-final.spec.ts)
// ---------------------------------------------------------------------------

function buildSingleEntryTar(options: {
  name: string;
  content: Buffer;
  type?: string;
  mtime?: number;
  mode?: number;
  linkname?: string;
}): Buffer {
  const type = options.type ?? TarEntryType.FILE;
  const isLink =
    type === TarEntryType.SYMLINK ||
    type === TarEntryType.HARDLINK ||
    type === TarEntryType.DIRECTORY;
  const size = isLink ? 0 : options.content.length;

  const header = createHeader({
    name: options.name,
    size,
    type: type as '0',
    mtime: options.mtime,
    mode: options.mode,
    linkname: options.linkname,
  });

  const blocks: Buffer[] = [Buffer.from(header)];
  if (size > 0) {
    blocks.push(options.content);
    const pad = calculatePadding(size);
    if (pad > 0) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.from(createEndOfArchive()));
  return Buffer.concat(blocks);
}

// ---------------------------------------------------------------------------
// Test 1 — file.ts:287  mtime === 0 → false branch of `if (entry.mtime > 0)`
// ---------------------------------------------------------------------------

describe('extractFile() — mtime=0 skips utimes call (false branch of mtime > 0)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-delta-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('extracts a file entry with mtime=0 without error (utimes is not called)', async () => {
    const content = Buffer.from('content with zero mtime');
    const rawTar = buildSingleEntryTar({ name: 'zero-mtime.txt', content, mtime: 0 });

    const archivePath = path.join(tempDir, 'mtime0.tar.xz');
    await fs.writeFile(archivePath, xzSync(rawTar));

    const dest = path.join(tempDir, 'out');
    await extractFile(archivePath, { cwd: dest });

    const extracted = path.join(dest, 'zero-mtime.txt');
    const readBack = await fs.readFile(extracted);
    expect(readBack).toEqual(content);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — file.ts:519  explicit TarEntryType.FILE dispatch
// ---------------------------------------------------------------------------

describe('extractFile() — explicit TarEntryType.FILE entry type', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-delta-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('extracts a FILE-type entry when type is explicitly TarEntryType.FILE', async () => {
    const content = Buffer.from('explicit FILE type content');
    const rawTar = buildSingleEntryTar({
      name: 'explicit-file-type.txt',
      content,
      type: TarEntryType.FILE,
    });

    const archivePath = path.join(tempDir, 'explicit-type.tar.xz');
    await fs.writeFile(archivePath, xzSync(rawTar));

    const dest = path.join(tempDir, 'out');
    await extractFile(archivePath, { cwd: dest });

    const extracted = path.join(dest, 'explicit-file-type.txt');
    const readBack = await fs.readFile(extracted);
    expect(readBack).toEqual(content);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — file.ts:523  mode=0 in header → (0 ?? 0o644) & SAFE_MODE_MASK = 0
// POSIX-only: mode bits are not fully respected on Windows.
// ---------------------------------------------------------------------------

describe('extractFile() — mode=0 in TAR header (mode code path, POSIX only)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-delta-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it.skipIf(process.platform === 'win32')(
    'extracts file with mode=0 in header; resulting permission bits are 0 (POSIX only)',
    async () => {
      // Skip also if running as root (root bypasses permission checks)
      if (process.getuid?.() === 0) return;

      const content = Buffer.from('zero mode content');
      // Pass mode: 0 explicitly — createHeader writes octal 0000000 to the mode field.
      // parseOctal returns 0 for an all-zero field, so entry.mode = 0 at extraction time.
      // (0 ?? 0o644) = 0, so fileMode = 0 & SAFE_MODE_MASK = 0.
      const rawTar = buildSingleEntryTar({ name: 'zero-mode.txt', content, mode: 0 });

      const archivePath = path.join(tempDir, 'mode0.tar.xz');
      await fs.writeFile(archivePath, xzSync(rawTar));

      const dest = path.join(tempDir, 'out');
      await extractFile(archivePath, { cwd: dest });

      const extracted = path.join(dest, 'zero-mode.txt');

      // File must exist
      const stat = await fs.stat(extracted);
      expect(stat.isFile()).toBe(true);

      // Mode bits must be 0 (no permissions) — SAFE_MODE_MASK = 0o0777
      // stat.mode includes file type bits; mask to permission bits only.
      const permBits = stat.mode & 0o777;
      expect(permBits).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------
// Test B — file.ts:170  SYMLINK with linkname fully stripped → early return
//
// When strip=N removes all components from the SYMLINK linkname, the early-
// return `if (!strippedLinkname) return;` fires and the entry is silently
// skipped (no symlink created on disk, no error).
// ---------------------------------------------------------------------------

describe('extractFile() — SYMLINK entry skipped when strip removes entire linkname', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-zeta-sym-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('silently skips a SYMLINK entry when strip=1 removes its 1-component linkname', async () => {
    // entry name: "prefix/link-target.txt" → strip=1 strips "prefix/" → yielded as "link-target.txt"
    // linkname: "only-one-part" → extractSymlinkEntry strips 1 component →
    //   parts = ['only-one-part'], parts.slice(1) = [] → strippedLinkname = '' → early return
    const rawTar = buildSingleEntryTar({
      name: 'prefix/link-target.txt',
      content: Buffer.alloc(0),
      type: TarEntryType.SYMLINK,
      linkname: 'only-one-part',
    });

    const archivePath = path.join(tempDir, 'sym-strip.tar.xz');
    await fs.writeFile(archivePath, xzSync(rawTar));

    const dest = path.join(tempDir, 'out');
    await fs.mkdir(dest);

    // strip=1 strips "prefix/" from the entry name (yielded as "link-target.txt")
    // and also strips "only-one-part" → strippedLinkname = '' → early return in extractSymlinkEntry
    await extractFile(archivePath, { cwd: dest, strip: 1 });

    // The symlink must NOT have been created (silently skipped)
    const symlinkPath = path.join(dest, 'link-target.txt');
    const exists = await fs
      .lstat(symlinkPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test C — file.ts:208  HARDLINK with linkname fully stripped → early return
//
// When strip=N removes all components from the HARDLINK linkname, the early-
// return `if (!strippedLinkname) return;` fires and the entry is silently
// skipped (no hardlink created on disk, no error).
// ---------------------------------------------------------------------------

describe('extractFile() — HARDLINK entry skipped when strip removes entire linkname', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-zeta-hard-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('silently skips a HARDLINK entry when strip=1 removes its 1-component linkname', async () => {
    // HARDLINK linkname has exactly 1 component: "only-one-part"
    // After strip=1 → parts.slice(1) = [] → strippedLinkname = '' → early return
    const rawTar = buildSingleEntryTar({
      name: 'prefix/hardlink-target.txt',
      content: Buffer.alloc(0),
      type: TarEntryType.HARDLINK,
      linkname: 'only-one-part',
    });

    const archivePath = path.join(tempDir, 'hard-strip.tar.xz');
    await fs.writeFile(archivePath, xzSync(rawTar));

    const dest = path.join(tempDir, 'out');
    await fs.mkdir(dest);

    // strip=1 strips "prefix/" from the entry name and strips
    // "only-one-part" → ['only-one-part'].slice(1) = [] → strippedLinkname = ''
    await extractFile(archivePath, { cwd: dest, strip: 1 });

    // The hardlink must NOT have been created (silently skipped)
    const hardlinkPath = path.join(dest, 'hardlink-target.txt');
    const exists = await fs
      .lstat(hardlinkPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});
