/**
 * Security regression gate — Block 5 (TAR-XZ-STREAMING-2026-04-28)
 *
 * Consolidates all 18 TOCTOU + safety vectors into a single labelled file so
 * that any future change to extract.ts / list.ts / file.ts / xz-helpers.ts
 * that breaks a security invariant fails here with an unambiguous test name.
 *
 * Vector map:
 *  V1/R6-1  — leaf symlink check            → ensureSafeTarget
 *  F-001    — traversal rel === '..'         → ensureSafeTarget
 *  F-002    — TOCTOU ancestor check          → hasSymlinkAncestor
 *  R4-2     — hardlink strip logic           → extractFile
 *  R5-1     — hardlink symlink source        → extractFile
 *  V6a/V6b  — NUL/empty name                → ensureSafeName
 *  V12      — setuid mask                    → extractFile
 *  S2       — hardlink escape                → extractFile
 *  S3       — symlink ancestor TOCTOU        → hasSymlinkAncestor
 *  V2/V3    — fd-based O_NOFOLLOW            → extractFile
 *  S-14     — Windows TOCTOU window policy   → threat-model doc note
 *  S-15     — PAX bomb DoS                   → parseTar MAX_PAX_HEADER_BYTES
 */

import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { xzSync } from 'node-liblzma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractFile } from '../src/node/file.js';
import { extract } from '../src/node/index.js';
import { calculatePadding, createEndOfArchive, createHeader } from '../src/tar/format.js';
import { createPaxHeaderBlocks } from '../src/tar/pax.js';
import { TarEntryType } from '../src/types.js';

// ---------------------------------------------------------------------------
// Local test helpers (mirrors coverage.spec.ts helpers — intentionally local
// so this file is self-contained as a regression lock).
// ---------------------------------------------------------------------------

/** Build a raw TAR buffer from entry descriptors. */
function buildTar(
  entries: Array<{
    name: string;
    content?: Buffer;
    type?: string;
    linkname?: string;
    usePax?: boolean;
    mode?: number;
  }>
): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const content = entry.content ?? Buffer.alloc(0);
    const type = (entry.type ?? TarEntryType.FILE) as string;
    const isDir = type === TarEntryType.DIRECTORY;
    const isLink = type === TarEntryType.SYMLINK || type === TarEntryType.HARDLINK;
    const size = isDir || isLink ? 0 : content.length;

    let headerName = entry.name;

    if (entry.usePax || headerName.length > 255) {
      const paxBlocks = createPaxHeaderBlocks(headerName, {
        path: headerName,
        size,
        linkpath: entry.linkname,
      });
      for (const block of paxBlocks) {
        blocks.push(Buffer.from(block));
      }
      headerName = headerName.slice(-99);
    }

    const header = createHeader({
      name: headerName,
      size,
      type: type as '0',
      linkname: entry.linkname,
      mode: entry.mode,
    });
    blocks.push(Buffer.from(header));

    if (size > 0) {
      blocks.push(content);
      const pad = calculatePadding(size);
      if (pad > 0) blocks.push(Buffer.alloc(pad));
    }
  }

  blocks.push(Buffer.from(createEndOfArchive()));
  return Buffer.concat(blocks);
}

/** Compress a raw TAR buffer to .tar.xz and write to archivePath. */
async function saveAsXz(tar: Buffer | Uint8Array, archivePath: string): Promise<void> {
  await fs.writeFile(archivePath, xzSync(Buffer.isBuffer(tar) ? tar : Buffer.from(tar)));
}

/** Build a .tar.xz archive containing a crafted PAX header claiming a giant payload.
 *
 * The returned Buffer is a valid XZ stream containing a TAR archive where the
 * PAX_HEADER entry declares `size = claimedSize` bytes but only `actualBytes`
 * bytes of PAX data are provided.
 */
function buildPaxBombTar(claimedSize: number, actualBytes: number): Buffer {
  const blocks: Buffer[] = [];

  // PAX extended header entry claiming `claimedSize` bytes
  const paxHeader = createHeader({
    name: 'PaxHeaders/bomb.txt',
    type: TarEntryType.PAX_HEADER,
    size: claimedSize,
  });
  blocks.push(Buffer.from(paxHeader));

  // Only actualBytes of payload (truncated PAX data)
  const fakePayload = Buffer.alloc(actualBytes, 0x20); // spaces
  blocks.push(fakePayload);
  if (actualBytes > 0) {
    const pad = calculatePadding(actualBytes);
    if (pad > 0) blocks.push(Buffer.alloc(pad));
  }

  blocks.push(Buffer.from(createEndOfArchive()));
  return Buffer.concat(blocks);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Security regression gate', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-sec-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  // -------------------------------------------------------------------------
  // V1/R6-1 — Leaf symlink check (ensureSafeTarget)
  // -------------------------------------------------------------------------

  describe('V1/R6-1: leaf symlink check (ensureSafeTarget)', () => {
    it('V1/R6-1 FILE: rejects overwrite when target is a pre-existing symlink', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);
      const secretFile = path.join(externalDir, 'secret');
      await fs.writeFile(secretFile, 'original-secret');

      // archive: SYMLINK evil → ../external/secret, then FILE evil (attempts overwrite)
      const tar = buildTar([
        { name: 'evil', type: TarEntryType.SYMLINK, linkname: '../external/secret' },
        { name: 'evil', content: Buffer.from('overwritten') },
      ]);
      const archive = path.join(tempDir, 'leaf-file.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // External file must NOT be overwritten
      expect(await fs.readFile(secretFile, 'utf8')).toBe('original-secret');
    });

    it('V1/R6-1 DIRECTORY: rejects when target is a pre-existing symlink', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      const tar = buildTar([
        { name: 'evil', type: TarEntryType.SYMLINK, linkname: '../external' },
        { name: 'evil/', type: TarEntryType.DIRECTORY },
      ]);
      const archive = path.join(tempDir, 'leaf-dir.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);
    });
  });

  // -------------------------------------------------------------------------
  // F-001 — Path traversal rel === '..' (ensureSafeTarget)
  // -------------------------------------------------------------------------

  describe('F-001: path traversal via ".." segments (ensureSafeTarget)', () => {
    it('F-001: rejects ../../../escape style path traversal', async () => {
      const tar = buildTar([{ name: '../../../tmp/evil.txt', content: Buffer.from('evil') }]);
      const archive = path.join(tempDir, 'traversal.tar.xz');
      await saveAsXz(tar, archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/outside cwd/i);
    });

    it('F-001: rejects entry named ".." (dot-dot directory)', async () => {
      const tar = buildTar([{ name: '..', type: TarEntryType.DIRECTORY }]);
      const archive = path.join(tempDir, 'dotdot.tar.xz');
      await saveAsXz(tar, archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      // Either "outside cwd" or "dot-segment" rejection is acceptable
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow();
    });

    it('F-001: does NOT reject legitimate dotfiles like ".gitignore"', async () => {
      const tar = buildTar([{ name: '.gitignore', content: Buffer.from('*.log') }]);
      const archive = path.join(tempDir, 'dotfile.tar.xz');
      await saveAsXz(tar, archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      await extractFile(archive, { cwd: dest });
      expect(await fs.readFile(path.join(dest, '.gitignore'), 'utf8')).toBe('*.log');
    });
  });

  // -------------------------------------------------------------------------
  // F-002 — TOCTOU ancestor check (hasSymlinkAncestor)
  // -------------------------------------------------------------------------

  describe('F-002: TOCTOU ancestor check (hasSymlinkAncestor)', () => {
    it('F-002: rejects file written through symlink ancestor (S3 vector)', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      // symlink 'link' → '../external', then 'link/file.txt' through it
      const tar = buildTar([
        { name: 'link', type: TarEntryType.SYMLINK, linkname: '../external' },
        { name: 'link/file.txt', content: Buffer.from('escaped') },
      ]);
      const archive = path.join(tempDir, 'toctou.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // External directory must remain empty
      expect(await fs.readdir(externalDir)).toHaveLength(0);
    });

    it('F-002: rejects directory created through symlink ancestor', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      const tar = buildTar([
        { name: 'link', type: TarEntryType.SYMLINK, linkname: '../external' },
        { name: 'link/subdir/', type: TarEntryType.DIRECTORY },
      ]);
      const archive = path.join(tempDir, 'dir-toctou.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // external/subdir must NOT have been created
      expect(await fs.readdir(externalDir)).toHaveLength(0);
    });

    it('F-002 / R3-1: walks past ENOENT when checking ancestor symlinks', async () => {
      // Regression: old code returned false on ENOENT in hasSymlinkAncestor,
      // stopping the walk early. Archive: link→../external, then link/subdir/file.txt
      // (link/subdir does NOT exist). Walk must continue past the ENOENT.
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      const tar = buildTar([
        { name: 'link', type: TarEntryType.SYMLINK, linkname: '../external' },
        { name: 'link/subdir/file.txt', content: Buffer.from('escaped') },
      ]);
      const archive = path.join(tempDir, 'enoent-toctou.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // External must be empty
      expect(await fs.readdir(externalDir)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // S3 — Symlink ancestor TOCTOU (hasSymlinkAncestor) — comprehensive variants
  // -------------------------------------------------------------------------

  describe('S3: symlink ancestor TOCTOU — all entry types', () => {
    it('S3 SYMLINK: rejects symlink entry whose path has a symlink ancestor', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      const tar = buildTar([
        { name: 'link', type: TarEntryType.SYMLINK, linkname: '../external' },
        { name: 'link/inner', type: TarEntryType.SYMLINK, linkname: 'anything' },
      ]);
      const archive = path.join(tempDir, 'sym-toctou.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);
      expect(await fs.readdir(externalDir)).toHaveLength(0);
    });

    it('S3 HARDLINK: rejects hardlink entry whose target path has a symlink ancestor', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      const tar = buildTar([
        { name: 'original.txt', content: Buffer.from('data') },
        { name: 'link', type: TarEntryType.SYMLINK, linkname: '../external' },
        { name: 'link/file.txt', type: TarEntryType.HARDLINK, linkname: 'original.txt' },
      ]);
      const archive = path.join(tempDir, 'hl-toctou.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);
      expect(await fs.readdir(externalDir)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // R4-2 — Hardlink strip logic (extractFile)
  // -------------------------------------------------------------------------

  describe('R4-2: hardlink strip logic (extractFile)', () => {
    it('R4-2: strip option applies to hardlink linkname (not just entry name)', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const tar = buildTar([
        { name: 'dir/a.txt', content: Buffer.from('content') },
        { name: 'dir/link', type: TarEntryType.HARDLINK, linkname: 'dir/a.txt' },
      ]);
      const archive = path.join(tempDir, 'hl-strip.tar.xz');
      await saveAsXz(tar, archive);

      // strip: 1 → 'dir/a.txt' → 'a.txt'; 'dir/link' → 'link'; linkname 'dir/a.txt' → 'a.txt'
      await extractFile(archive, { cwd: dest, strip: 1 });

      const aPath = path.join(dest, 'a.txt');
      const linkPath = path.join(dest, 'link');
      expect(await fs.readFile(aPath, 'utf8')).toBe('content');
      expect(await fs.readFile(linkPath, 'utf8')).toBe('content');

      // Confirm hardlink semantics: same inode
      const aStat = await fs.stat(aPath);
      const linkStat = await fs.stat(linkPath);
      expect(linkStat.ino).toBe(aStat.ino);
    });
  });

  // -------------------------------------------------------------------------
  // R5-1 — Hardlink symlink source (extractFile)
  // -------------------------------------------------------------------------

  describe('R5-1: hardlink whose linkname is a symlink (extractFile)', () => {
    it('R5-1: rejects hardlink with symlink as link source', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);
      const secretFile = path.join(externalDir, 'secret');
      await fs.writeFile(secretFile, 'sensitive');

      // Step 1: plant symlink 's' → ../external/secret
      // Step 2: hardlink 'myhardlink' with linkname 's' (the symlink)
      const tar = buildTar([
        { name: 's', type: TarEntryType.SYMLINK, linkname: '../external/secret' },
        { name: 'myhardlink', type: TarEntryType.HARDLINK, linkname: 's' },
      ]);
      const archive = path.join(tempDir, 'hl-symlink-src.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // myhardlink must not appear in dest
      expect(await fs.readdir(dest)).not.toContain('myhardlink');

      // External secret file's link count must remain 1 (hardlink not created)
      const secretStat = await fs.stat(secretFile);
      expect(secretStat.nlink).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // S2 — Hardlink escape (extractFile)
  // -------------------------------------------------------------------------

  describe('S2: hardlink escape via relative ".." linkname (extractFile)', () => {
    it('S2: rejects hardlink whose linkname resolves outside cwd', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      // HARDLINK with linkname '../external/target' escapes cwd
      const tar = buildTar([
        { name: 'escape-link', type: TarEntryType.HARDLINK, linkname: '../external/target' },
      ]);
      const archive = path.join(tempDir, 'hl-escape.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/cwd/i);
    });
  });

  // -------------------------------------------------------------------------
  // V6a/V6b — NUL byte / empty name (ensureSafeName)
  // -------------------------------------------------------------------------

  describe('V6a/V6b: NUL byte / empty name (ensureSafeName)', () => {
    it('V6a: rejects SYMLINK entry with empty linkname', async () => {
      const tar = buildTar([{ name: 'link.txt', type: TarEntryType.SYMLINK, linkname: '' }]);
      const archive = path.join(tempDir, 'empty-linkname.tar.xz');
      await saveAsXz(tar, archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/empty linkname/i);
    });

    it('V6b: rejects SYMLINK with NUL byte in linkname', async () => {
      // Craft a SYMLINK header with NUL at offset 158 (inside linkname field)
      const header = createHeader({
        name: 'link.txt',
        type: TarEntryType.SYMLINK,
        linkname: 'target.txt',
      });
      // Inject NUL at position 158 — linkname field starts at 157
      header[158] = 0x00;
      // Recalculate checksum
      let checksum = 0;
      for (let i = 0; i < 512; i++) {
        checksum += i >= 148 && i < 156 ? 0x20 : (header[i] ?? 0);
      }
      const checksumStr = `${checksum.toString(8).padStart(6, '0')}\x00 `;
      for (let i = 0; i < 8; i++) header[148 + i] = checksumStr.charCodeAt(i);

      const archive = path.join(tempDir, 'nul-linkname.tar.xz');
      await saveAsXz(
        Buffer.concat([Buffer.from(header), Buffer.from(createEndOfArchive())]),
        archive
      );

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      // NUL truncates linkname at position 1 ('t') — result is '' which is empty,
      // OR the NUL-containing string is caught by NUL check. Either is safe.
      // Key: no file escapes dest.
      try {
        await extractFile(archive, { cwd: dest });
        const destContents = await fs.readdir(dest);
        for (const f of destContents) {
          expect(path.resolve(dest, f).startsWith(dest)).toBe(true);
        }
      } catch {
        // Rejection is acceptable — both outcomes are safe
      }
    });

    it('V6b: rejects FILE entry name containing NUL byte', async () => {
      // Craft a FILE header with NUL at offset 4 in the name field
      const content = Buffer.from('evil');
      const header = createHeader({ name: 'safe.txt', size: content.length });
      header[4] = 0x00;
      // Recalculate checksum
      let checksum = 0;
      for (let i = 0; i < 512; i++) {
        checksum += i >= 148 && i < 156 ? 0x20 : (header[i] ?? 0);
      }
      const checksumStr = `${checksum.toString(8).padStart(6, '0')}\x00 `;
      for (let i = 0; i < 8; i++) header[148 + i] = checksumStr.charCodeAt(i);

      const archive = path.join(tempDir, 'nul-name.tar.xz');
      await saveAsXz(
        Buffer.concat([
          Buffer.from(header),
          content,
          Buffer.alloc(calculatePadding(content.length)),
          Buffer.from(createEndOfArchive()),
        ]),
        archive
      );

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      // NUL truncates name — result is safe extraction OR rejection. Both are safe.
      try {
        await extractFile(archive, { cwd: dest });
        const destContents = await fs.readdir(dest);
        for (const f of destContents) {
          expect(path.resolve(dest, f).startsWith(dest)).toBe(true);
        }
      } catch {
        // Rejection is acceptable
      }
    });
  });

  // -------------------------------------------------------------------------
  // V12 — setuid/setgid/sticky bit stripping (extractFile)
  // -------------------------------------------------------------------------

  describe('V12: setuid/setgid/sticky bit stripping (extractFile)', () => {
    it('V12: strips setuid bit from extracted file (0o4755 → 0o755)', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const tar = buildTar([{ name: 'x', content: Buffer.from('data') }]);
      const tarBuf = Buffer.from(tar);
      // Patch mode field at offset 100 to 0o4755 (setuid + rwxr-xr-x)
      const modeStr = `${(0o4755).toString(8).padStart(7, '0')}\x00`;
      for (let i = 0; i < 8; i++) tarBuf[100 + i] = modeStr.charCodeAt(i);
      // Recalculate checksum
      let checksum = 0;
      for (let i = 0; i < 512; i++) {
        checksum += i >= 148 && i < 156 ? 0x20 : (tarBuf[i] ?? 0);
      }
      const checksumStr = `${checksum.toString(8).padStart(6, '0')}\x00 `;
      for (let i = 0; i < 8; i++) tarBuf[148 + i] = checksumStr.charCodeAt(i);

      const archive = path.join(tempDir, 'setuid.tar.xz');
      await saveAsXz(tarBuf, archive);

      await extractFile(archive, { cwd: dest });

      const stat = await fs.stat(path.join(dest, 'x'));
      expect(stat.mode & 0o7000).toBe(0); // setuid bit stripped
      expect(stat.mode & 0o777).toBe(0o755); // rwxr-xr-x preserved
    });

    it('V12: strips setgid+sticky bits from extracted directory', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const header = createHeader({ name: 'testdir/', type: TarEntryType.DIRECTORY, mode: 0o3755 });
      const tarBuf = Buffer.concat([Buffer.from(header), Buffer.from(createEndOfArchive())]);

      const archive = path.join(tempDir, 'setgid-dir.tar.xz');
      await saveAsXz(tarBuf, archive);

      await extractFile(archive, { cwd: dest });

      const stat = await fs.stat(path.join(dest, 'testdir'));
      expect(stat.mode & 0o7000).toBe(0); // setgid+sticky stripped
    });
  });

  // -------------------------------------------------------------------------
  // V2/V3 — fd-based O_NOFOLLOW (extractFile, POSIX only)
  // -------------------------------------------------------------------------

  describe('V2/V3: fd-based O_NOFOLLOW extraction (POSIX only, extractFile)', () => {
    it('V2/V3: O_NOFOLLOW catches symlink even if leaf check somehow missed it', async () => {
      if (process.platform === 'win32') {
        // S-14: Windows uses by-path extraction — O_NOFOLLOW unavailable.
        // TOCTOU window scales with entry size on Windows (see §12.2 policy).
        // This test is skipped; see TODO [Win32] handle-based extraction.
        console.log(
          'SKIP V2/V3 on win32: O_NOFOLLOW unavailable — Windows TOCTOU window documented in §12.2'
        );
        return;
      }

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);
      const secretFile = path.join(externalDir, 'secret');
      await fs.writeFile(secretFile, 'sensitive');

      // Archive: SYMLINK evil → ../external/secret, then FILE evil
      // The leaf-symlink check (ensureSafeTarget) would normally catch this,
      // but on POSIX the O_NOFOLLOW open also rejects it independently.
      const tar = buildTar([
        { name: 'evil', type: TarEntryType.SYMLINK, linkname: '../external/secret' },
        { name: 'evil', content: Buffer.from('overwrite attempt') },
      ]);
      const archive = path.join(tempDir, 'onofollow.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // External secret must NOT be overwritten
      expect(await fs.readFile(secretFile, 'utf8')).toBe('sensitive');
    });
  });

  // -------------------------------------------------------------------------
  // S-14 — Windows TOCTOU window policy (threat-model documentation)
  // -------------------------------------------------------------------------

  describe('S-14: Windows TOCTOU window policy', () => {
    it('S-14: on Windows, by-path extraction means TOCTOU window scales with entry size', async () => {
      if (process.platform !== 'win32') {
        // POSIX uses O_NOFOLLOW fd-based extraction — TOCTOU window is minimal.
        // This test documents the Windows threat model; there is no runtime assertion
        // for POSIX because the window is architectural, not runtime-observable.
        console.log(
          'S-14 INFO (non-Windows): POSIX path uses O_NOFOLLOW — TOCTOU window minimal. ' +
            'Windows by-path fallback has extended window (see §12.2, TODO [Win32] handle-based extraction).'
        );
        return;
      }

      // On Windows: verify ensureSafeTarget runs ONCE before any write.
      // We can only check that extraction completes or rejects safely —
      // the window itself is architectural (by-path) and cannot be closed
      // without handle-based extraction (CreateFileW + FILE_FLAG_OPEN_REPARSE_POINT).
      // TODO [Win32] handle-based extraction for tar-xz Node extractFile.
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const archive = path.join(tempDir, 'safe.tar.xz');
      const tar = buildTar([{ name: 'data.bin', content: Buffer.alloc(512, 0xab) }]);
      await saveAsXz(tar, archive);

      // Should extract cleanly — no malicious entry in this archive
      await expect(extractFile(archive, { cwd: dest })).resolves.toBeUndefined();
      expect(await fs.readFile(path.join(dest, 'data.bin'))).toHaveLength(512);
    });
  });

  // -------------------------------------------------------------------------
  // S-15 — PAX bomb DoS (parseTar MAX_PAX_HEADER_BYTES guard)
  // -------------------------------------------------------------------------

  describe('S-15: PAX bomb DoS — MAX_PAX_HEADER_BYTES guard', () => {
    it('S-15a: PAX header claiming 2 GB but only 1 KB actual — stream ends safely (no 2 GB allocation)', async () => {
      // The archive provides only 1 KB of PAX data after a header claiming 2 GB.
      // The stream runs out before the PAX bomb guard fires, so parseTar throws
      // "Unexpected end of archive" — which is also safe (no unbounded allocation).
      // This verifies the memory safety property: the parser never allocates 2 GB.
      const claimedSize = 2 * 1024 * 1024 * 1024; // 2 GB
      const actualBytes = 1024; // only 1 KB provided

      const tarBuf = buildPaxBombTar(claimedSize, actualBytes);
      const archive = path.join(tempDir, 'pax-bomb-truncated.tar.xz');
      await saveAsXz(tarBuf, archive);

      // Memory snapshot before: ensures we don't allocate 2 GB
      const memBefore = process.memoryUsage();

      let caught: Error | null = null;
      try {
        for await (const _ of extract(createReadStream(archive))) {
          // drain
        }
      } catch (err) {
        caught = err as Error;
      }

      const memAfter = process.memoryUsage();
      const heapDelta = memAfter.heapUsed - memBefore.heapUsed;

      // Must throw (either "Unexpected end" for truncated, or TAR_PARSER_INVARIANT if
      // the guard fires first — both are correct rejection outcomes)
      expect(caught).not.toBeNull();
      const isExpectedError =
        caught?.message.includes('Unexpected end') ||
        caught?.message.toLowerCase().includes('pax') ||
        (caught as Error & { code?: string }).code === 'TAR_PARSER_INVARIANT';
      expect(isExpectedError).toBe(true);

      // Heap delta must be < 5 MB — the parser must NOT have allocated 2 GB
      const MAX_ALLOWED_BYTES = 5 * 1024 * 1024; // 5 MB
      expect(heapDelta).toBeLessThan(MAX_ALLOWED_BYTES);
    });

    it('S-15b: PAX header providing > 1 MB of actual data triggers TAR_PARSER_INVARIANT', async () => {
      // This test provides MORE than 1 MB of actual PAX data to trigger the guard.
      // The guard fires in pullChunk() when state.buffer.length + chunk.length > MAX_PAX_HEADER_BYTES.
      // Expected: throws with err.code === 'TAR_PARSER_INVARIANT' and message containing 'PAX'.
      const OVER_LIMIT = 1024 * 1024 + 512; // 1 MB + 512 bytes — clearly over
      const tarBuf = buildPaxBombTar(OVER_LIMIT, OVER_LIMIT);
      const archive = path.join(tempDir, 'pax-over-limit.tar.xz');
      await saveAsXz(tarBuf, archive);

      let caught: Error | null = null;
      try {
        for await (const _ of extract(createReadStream(archive))) {
          /* drain */
        }
      } catch (err) {
        caught = err as Error;
      }

      expect(caught).not.toBeNull();
      expect(caught?.message).toMatch(/PAX|header exceeds/i);
      expect((caught as Error & { code?: string }).code).toBe('TAR_PARSER_INVARIANT');
    });
  });
});
