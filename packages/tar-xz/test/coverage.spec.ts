/**
 * Coverage completion tests — targeting all uncovered lines in tar-xz
 */
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { xzSync } from 'node-liblzma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extract } from '../src/node/index.js';
import { createFile, extractFile, listFile } from '../src/node/file.js';
import { parseOctal } from '../src/tar/checksum.js';
import {
  BLOCK_SIZE,
  calculatePadding,
  createEndOfArchive,
  createHeader,
  parseHeader,
} from '../src/tar/format.js';
import {
  applyPaxAttributes,
  createPaxData,
  createPaxHeaderBlocks,
  needsPaxHeaders,
  parsePaxData,
} from '../src/tar/pax.js';
import type { TarEntry } from '../src/types.js';
import { TarEntryType } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build raw TAR buffer from entry descriptors */
function buildTar(
  entries: Array<{
    name: string;
    content?: Buffer;
    type?: string;
    linkname?: string;
    usePax?: boolean;
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

/** Build raw TAR buffer with manual blocks (for global PAX, corrupted headers, etc.) */
function buildTarRaw(blocks: Array<Buffer | Uint8Array>): Buffer {
  return Buffer.concat(blocks.map((b) => Buffer.from(b)));
}

/** Save a raw TAR buffer as .tar.xz */
async function saveAsXz(tar: Buffer, outputPath: string): Promise<void> {
  await fs.writeFile(outputPath, xzSync(tar));
}

// ===========================================================================
// Unit tests: TAR format edge cases
// ===========================================================================

describe('Coverage: checksum edge cases', () => {
  it('parseOctal returns 0 for all-null field', () => {
    const buf = new Uint8Array(512);
    expect(parseOctal(buf, 0, 8)).toBe(0);
  });

  it('parseOctal returns 0 for non-octal characters', () => {
    const buf = new Uint8Array(512);
    buf[0] = 'z'.charCodeAt(0);
    buf[1] = '!'.charCodeAt(0);
    expect(parseOctal(buf, 0, 4)).toBe(0);
  });
});

describe('Coverage: prefix/name splitting', () => {
  it('splits names > 100 chars with path separators into prefix+name', () => {
    // Build a path with slashes, > 100 chars total, <= 255 chars
    const longName =
      'directory/with/many/nested/segments/' +
      'deeper/nested/path/structure/that/' +
      'exceeds/the/hundred/char/limit/for/tar/header/names/' +
      'file.txt';
    expect(longName.length).toBeGreaterThan(100);
    expect(longName.length).toBeLessThanOrEqual(255);

    const header = createHeader({ name: longName });
    const entry = parseHeader(header);
    expect(entry?.name).toBe(longName);
  });
});

// ===========================================================================
// Unit tests: PAX edge cases
// ===========================================================================

describe('Coverage: PAX data', () => {
  it('createPaxData skips undefined values', () => {
    const data = createPaxData({ path: 'test.txt', size: undefined });
    const text = new TextDecoder().decode(data);
    expect(text).toContain('path=test.txt');
    expect(text).not.toContain('size=');
  });

  it('createPaxData triggers length recalculation near digit boundary', () => {
    // Content " path=<91 x's>\n" = 98 chars. Initial: "98" (2 digits) → total 100.
    // "100" has 3 digits ≠ 2 → recalculate → "101" (3 digits) → stable
    const value = 'x'.repeat(91);
    const data = createPaxData({ path: value });
    const parsed = parsePaxData(data);
    expect(parsed.path).toBe(value);
  });
});

describe('Coverage: parsePaxData error handling', () => {
  const enc = new TextEncoder();

  it('stops on missing space separator', () => {
    expect(Object.keys(parsePaxData(enc.encode('noseparator')))).toHaveLength(0);
  });

  it('stops on NaN length', () => {
    expect(Object.keys(parsePaxData(enc.encode('abc key=value\n')))).toHaveLength(0);
  });

  it('stops on missing newline in record', () => {
    expect(Object.keys(parsePaxData(enc.encode('14 path=test..')))).toHaveLength(0);
  });
});

describe('Coverage: applyPaxAttributes', () => {
  it('applies all supported fields', () => {
    const entry: TarEntry = {
      name: 'old.txt',
      type: TarEntryType.FILE,
      size: 100,
      mode: 0o644,
      uid: 1000,
      gid: 1000,
      mtime: 1000000,
      uname: 'old',
      gname: 'old',
      devmajor: 0,
      devminor: 0,
      linkname: '',
    };

    const result = applyPaxAttributes(entry, {
      path: 'new.txt',
      linkpath: '/target',
      size: 200,
      mtime: 2000000.5,
      uid: 2000,
      gid: 2000,
      uname: 'newuser',
      gname: 'newgroup',
    });

    expect(result.name).toBe('new.txt');
    expect(result.linkname).toBe('/target');
    expect(result.size).toBe(200);
    expect(result.mtime).toBe(2000000);
    expect(result.uid).toBe(2000);
    expect(result.gid).toBe(2000);
    expect(result.uname).toBe('newuser');
    expect(result.gname).toBe('newgroup');
  });

  it('applies partial attributes (no path, no size)', () => {
    const entry: TarEntry = {
      name: 'keep.txt',
      type: TarEntryType.FILE,
      size: 100,
      mode: 0o644,
      uid: 1000,
      gid: 1000,
      mtime: 1000000,
      uname: 'user',
      gname: 'group',
      devmajor: 0,
      devminor: 0,
      linkname: '',
    };

    const result = applyPaxAttributes(entry, { mtime: 9999999.9 });
    expect(result.name).toBe('keep.txt');
    expect(result.size).toBe(100);
    expect(result.mtime).toBe(9999999);
  });
});

describe('Coverage: createPaxRecord boundary (pax.ts:63)', () => {
  it('recalculates length when digit count changes at 99→100 boundary', () => {
    // Key "path" + value of 91 'a's → content " path=aaa...a\n" = 98 chars
    // Initial lengthStr = "98" (2 digits), totalLength = 2 + 98 = 100
    // "100" has 3 digits ≠ 2 → while loop triggers → recalculates to 101
    const value = 'a'.repeat(91);
    const data = createPaxData({ path: value });
    expect(data).toBeInstanceOf(Uint8Array);

    const text = new TextDecoder().decode(data);
    expect(text).toMatch(/^\d+ path=/);
    // Verify the record starts with "101" (3-digit length after recalculation)
    expect(text).toMatch(/^101 path=/);

    // Roundtrip: parsePaxData should recover the value
    const parsed = parsePaxData(data);
    expect(parsed.path).toBe(value);
  });

  it('does not trigger recalculation when digit count is stable', () => {
    // Short value: content " path=hello\n" = 12 chars
    // lengthStr = "12" (2 digits), totalLength = 2 + 12 = 14 → "14" still 2 digits → stable
    const data = createPaxData({ path: 'hello' });
    const text = new TextDecoder().decode(data);
    expect(text).toBe('14 path=hello\n');
  });
});

describe('Coverage: needsPaxHeaders linkname (pax.ts:167)', () => {
  it('returns true when linkname exceeds 100 chars', () => {
    expect(needsPaxHeaders({ name: 'link', linkname: 'a'.repeat(101) })).toBe(true);
  });

  it('returns false when linkname is exactly 100 chars', () => {
    expect(needsPaxHeaders({ name: 'link', linkname: 'a'.repeat(100) })).toBe(false);
  });

  it('returns false when linkname is absent', () => {
    expect(needsPaxHeaders({ name: 'link' })).toBe(false);
  });

  it('returns false when linkname is empty string', () => {
    expect(needsPaxHeaders({ name: 'link', linkname: '' })).toBe(false);
  });
});

describe('Coverage: createHeader isDir + long name split (format.ts:240)', () => {
  it('creates header for directory with name requiring prefix split', () => {
    // Directory path > 100 chars with slashes, requiring prefix/name splitting
    const longDir =
      'very/long/directory/path/that/exceeds/one/hundred/characters/' +
      'in/total/length/for/the/name/field/here/test/';
    expect(longDir.length).toBeGreaterThan(100);
    expect(longDir.length).toBeLessThanOrEqual(255);

    const header = createHeader({
      name: longDir,
      size: 0,
      mode: 0o755,
      type: TarEntryType.DIRECTORY,
    });
    expect(header).toBeInstanceOf(Uint8Array);
    expect(header.length).toBe(512);

    // Roundtrip: parseHeader should recover the full name
    const parsed = parseHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe(longDir);
    expect(parsed?.type).toBe(TarEntryType.DIRECTORY);
  });
});

describe('Coverage: createPaxHeaderBlocks', () => {
  it('creates parseable PAX header + data blocks', () => {
    const blocks = createPaxHeaderBlocks('file.txt', { path: 'very-long-file.txt' });
    expect(blocks.length).toBeGreaterThanOrEqual(2);

    const header = parseHeader(new Uint8Array(blocks[0]));
    expect(header).not.toBeNull();
    expect(header?.type).toBe(TarEntryType.PAX_HEADER);
    expect(header?.size).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Integration tests: Node API edge cases
// ===========================================================================

import { createReadStream } from 'node:fs';

/** Helper: collect an extract() async iterable to memory entries (using Node fs.createReadStream) */
async function collectExtract(
  archive: string,
  options: { strip?: number; filter?: (e: TarEntry) => boolean } = {}
): Promise<Array<{ name: string; type: string; content: Buffer; linkname: string }>> {
  const results: Array<{ name: string; type: string; content: Buffer; linkname: string }> = [];
  for await (const entry of extract(createReadStream(archive), options)) {
    const bytes = await entry.bytes();
    results.push({
      name: entry.name,
      type: entry.type,
      content: Buffer.from(bytes),
      linkname: entry.linkname,
    });
  }
  return results;
}

describe('Coverage: Node API', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-cov-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  // --- Symlinks ---

  describe('symlinks', () => {
    it('creates and extracts symlinks', async () => {
      const archive = path.join(tempDir, 'archive.tar.xz');
      // M1: use buildTar helper to create a proper symlink entry (createFile only
      // supports FILE/DIRECTORY via TarSourceFile; symlinks need a raw TAR approach).
      const tar = buildTar([
        { name: 'target.txt', content: Buffer.from('content') },
        { name: 'link.txt', type: TarEntryType.SYMLINK, linkname: 'target.txt' },
      ]);
      await saveAsXz(tar, archive);

      // List
      const entries = await listFile(archive);
      const linkEntry = entries.find((e) => e.name === 'link.txt');
      expect(linkEntry?.type).toBe(TarEntryType.SYMLINK);

      // Extract
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extractFile(archive, { cwd: dest });
      expect(await fs.readlink(path.join(dest, 'link.txt'))).toBe('target.txt');
    });

    it('replaces existing symlink on re-extract', async () => {
      const tar = buildTar([
        { name: 'target.txt', content: Buffer.from('content') },
        { name: 'link.txt', type: TarEntryType.SYMLINK, linkname: 'target.txt' },
      ]);
      const archive = path.join(tempDir, 'archive.tar.xz');
      await saveAsXz(tar, archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extractFile(archive, { cwd: dest });
      // Re-extract — exercises the unlink-before-symlink path
      await extractFile(archive, { cwd: dest });
      expect(await fs.readlink(path.join(dest, 'link.txt'))).toBe('target.txt');
    });
  });

  // --- Empty files ---

  describe('empty files', () => {
    it('handles empty files through createFile/listFile/extractFile', async () => {
      const archive = path.join(tempDir, 'archive.tar.xz');
      await createFile(archive, {
        files: [{ name: 'empty.txt', source: new Uint8Array(0) }],
      });

      const entries = await listFile(archive);
      expect(entries[0]?.size).toBe(0);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extractFile(archive, { cwd: dest });
      expect((await fs.stat(path.join(dest, 'empty.txt'))).size).toBe(0);
    });
  });

  // --- Empty directories ---

  describe('empty directories', () => {
    it('packs an empty directory into the archive', async () => {
      const archive = path.join(tempDir, 'archive.tar.xz');
      // Directory entries in v6: name ends with '/', source is empty Uint8Array
      await createFile(archive, {
        files: [{ name: 'emptydir/', source: new Uint8Array(0) }],
      });

      const entries = await listFile(archive);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.name).toBe('emptydir/');
      expect(entries[0]?.type).toBe(TarEntryType.DIRECTORY);
      expect(entries[0]?.size).toBe(0);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extractFile(archive, { cwd: dest });
      const stat = await fs.stat(path.join(dest, 'emptydir'));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  // --- Long filenames (PAX) ---

  describe('long filenames (PAX)', () => {
    it('roundtrips filenames > 255 chars via PAX headers', async () => {
      // 3 segments of 90 chars → full 3-level path = 273 chars → triggers PAX
      const segments = ['a'.repeat(90), 'b'.repeat(90), 'c'.repeat(90)];
      const deepDir = segments.join('/');
      const longName = `${deepDir}/file.txt`;

      const archive = path.join(tempDir, 'archive.tar.xz');
      await createFile(archive, {
        files: [
          { name: `${segments[0]}/`, source: new Uint8Array(0) },
          { name: `${segments[0]}/${segments[1]}/`, source: new Uint8Array(0) },
          { name: `${deepDir}/`, source: new Uint8Array(0) },
          { name: longName, source: Buffer.from('deep') },
        ],
      });

      const entries = await listFile(archive);
      const fileEntry = entries.find((e) => e.name.endsWith('file.txt'));
      expect(fileEntry).toBeDefined();
      expect(fileEntry?.name).toBe(longName);

      const dest = path.join(tempDir, 'dest');
      await extractFile(archive, { cwd: dest });
      expect(await fs.readFile(path.join(dest, longName), 'utf-8')).toBe('deep');
    });
  });

  // --- Crafted archives ---

  describe('crafted archives', () => {
    it('extracts hardlinks', async () => {
      const tar = buildTar([
        { name: 'original.txt', content: Buffer.from('Hello') },
        { name: 'link.txt', type: TarEntryType.HARDLINK, linkname: 'original.txt' },
      ]);

      const archive = path.join(tempDir, 'archive.tar.xz');
      await saveAsXz(tar, archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extractFile(archive, { cwd: dest });

      expect(await fs.readFile(path.join(dest, 'original.txt'), 'utf-8')).toBe('Hello');
      expect(await fs.readFile(path.join(dest, 'link.txt'), 'utf-8')).toBe('Hello');
    });

    it('replaces existing file for hardlink re-extract', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await fs.writeFile(path.join(dest, 'original.txt'), 'Hello');
      await fs.writeFile(path.join(dest, 'link.txt'), 'Old');

      const tar = buildTar([
        { name: 'original.txt', content: Buffer.from('Hello') },
        { name: 'link.txt', type: TarEntryType.HARDLINK, linkname: 'original.txt' },
      ]);

      const archive = path.join(tempDir, 'archive.tar.xz');
      await saveAsXz(tar, archive);
      await extractFile(archive, { cwd: dest });

      expect(await fs.readFile(path.join(dest, 'link.txt'), 'utf-8')).toBe('Hello');
    });

    it('handles PAX global headers gracefully', async () => {
      const globalPaxData = new TextEncoder().encode('30 SCHILY.xattr.test=value\n');

      const blocks: Array<Buffer | Uint8Array> = [];

      blocks.push(
        createHeader({
          name: 'pax_global_header',
          type: TarEntryType.PAX_GLOBAL,
          size: globalPaxData.length,
        })
      );
      blocks.push(globalPaxData);
      const gPad = calculatePadding(globalPaxData.length);
      if (gPad > 0) blocks.push(new Uint8Array(gPad));

      const content = Buffer.from('Hello');
      blocks.push(createHeader({ name: 'file.txt', size: content.length }));
      blocks.push(content);
      const fPad = calculatePadding(content.length);
      if (fPad > 0) blocks.push(new Uint8Array(fPad));

      blocks.push(createEndOfArchive());

      const archive = path.join(tempDir, 'archive.tar.xz');
      await saveAsXz(buildTarRaw(blocks), archive);

      const entries = await listFile(archive);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.name).toBe('file.txt');

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extractFile(archive, { cwd: dest });
      expect(await fs.readFile(path.join(dest, 'file.txt'), 'utf-8')).toBe('Hello');
    });

    it('handles crafted PAX extended headers in extract/list', async () => {
      const longName = `dir/${'a'.repeat(120)}/${'b'.repeat(120)}/file.txt`;
      const tar = buildTar([{ name: longName, content: Buffer.from('PAX content'), usePax: true }]);

      const archive = path.join(tempDir, 'archive.tar.xz');
      await saveAsXz(tar, archive);

      const entries = await listFile(archive);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.name).toBe(longName);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extractFile(archive, { cwd: dest });
      expect(await fs.readFile(path.join(dest, longName), 'utf-8')).toBe('PAX content');
    });

    it('rejects path traversal in extractFile', async () => {
      const tar = buildTar([{ name: '../../../tmp/evil.txt', content: Buffer.from('evil') }]);

      const archive = path.join(tempDir, 'archive.tar.xz');
      await saveAsXz(tar, archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/outside cwd/i);
    });

    it('rejects file write through symlink ancestor (TOCTOU guard)', async () => {
      // S3: archive first creates a symlink pointing outside cwd, then tries to
      // write a file through it. The extractor must reject the file write.
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      // Step 1: create a directory that the symlink will point to (outside dest).
      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      // Step 2: build the archive — symlink 'link' → '../external', then 'link/file.txt'
      const tar = buildTar([
        // Symlink entry: link → ../external (points outside dest)
        { name: 'link', type: TarEntryType.SYMLINK, linkname: '../external' },
        // File entry written through the symlink path
        { name: 'link/file.txt', content: Buffer.from('escaped') },
      ]);

      const archive = path.join(tempDir, 'toctou.tar.xz');
      await saveAsXz(tar, archive);

      // The extractor must reject the file write through the symlink ancestor.
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // The external directory must NOT have been written to.
      const externalFiles = await fs.readdir(externalDir);
      expect(externalFiles).toHaveLength(0);
    });

    // --- F-003 regression tests: F-002 escape vectors (DIRECTORY / HARDLINK / SYMLINK) ---

    it('F-003a: rejects directory entry created through symlink ancestor (TOCTOU guard)', async () => {
      // Attack vector: archive creates link→../external (symlink), then link/subdir/ (directory).
      // mkdir(link/subdir/) follows the symlink and creates external/subdir/ — an escape.
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      const tar = buildTar([
        // Step 1: plant symlink inside dest pointing outside
        { name: 'link', type: TarEntryType.SYMLINK, linkname: '../external' },
        // Step 2: directory entry through the symlink
        { name: 'link/subdir/', type: TarEntryType.DIRECTORY },
      ]);

      const archive = path.join(tempDir, 'dir-toctou.tar.xz');
      await saveAsXz(tar, archive);

      // Must reject — directory creation through a symlink ancestor is an escape vector.
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // external/subdir MUST NOT have been created.
      const externalContents = await fs.readdir(externalDir);
      expect(externalContents).toHaveLength(0);
    });

    it('F-003b: rejects hardlink entry whose target path has a symlink ancestor (TOCTOU guard)', async () => {
      // Attack vector: archive plants link→../external, then link/file.txt (hardlink to original).
      // link(original, link/file.txt) follows the symlink and creates external/file.txt — an escape.
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      const tar = buildTar([
        // Lay down an original file first (hardlink source must exist)
        { name: 'original.txt', content: Buffer.from('data') },
        // Plant the symlink
        { name: 'link', type: TarEntryType.SYMLINK, linkname: '../external' },
        // Hardlink through the symlink ancestor
        { name: 'link/file.txt', type: TarEntryType.HARDLINK, linkname: 'original.txt' },
      ]);

      const archive = path.join(tempDir, 'hl-toctou.tar.xz');
      await saveAsXz(tar, archive);

      // Must reject — hardlink destination through a symlink ancestor is an escape vector.
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // external/ MUST be empty.
      const externalContents = await fs.readdir(externalDir);
      expect(externalContents).toHaveLength(0);
    });

    it('F-003c: rejects symlink entry whose target path has a symlink ancestor (TOCTOU guard)', async () => {
      // Attack vector: archive plants link→../external, then link/inner (symlink to anything).
      // symlink(anything, link/inner) follows the symlink ancestor and creates external/inner.
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      const tar = buildTar([
        // Plant outer symlink pointing outside
        { name: 'link', type: TarEntryType.SYMLINK, linkname: '../external' },
        // Inner symlink entry whose destination path passes through the outer symlink
        { name: 'link/inner', type: TarEntryType.SYMLINK, linkname: 'anything' },
      ]);

      const archive = path.join(tempDir, 'sym-toctou.tar.xz');
      await saveAsXz(tar, archive);

      // Must reject — creating a symlink through a symlink ancestor is an escape vector.
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // external/ MUST be empty.
      const externalContents = await fs.readdir(externalDir);
      expect(externalContents).toHaveLength(0);
    });

    it('R3-1 regression: rejects file through symlink ancestor when intermediate dir is missing (ENOENT bypass fix)', async () => {
      // Bug: old code returned false on ENOENT in hasSymlinkAncestor,
      // which stopped the ancestor walk early. An archive could:
      //   1. Create link → ../external (symlink, now on disk)
      //   2. Write link/subdir/file.txt (link/subdir does NOT exist yet)
      //      → lstat(link/subdir) → ENOENT → old code: return false → escape!
      // Fix: ENOENT means "not yet created", continue walking up.
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);

      // Archive: symlink 'link' → '../external', then 'link/subdir/file.txt'
      // (link/subdir does NOT exist on disk before extraction).
      const tar = buildTar([
        { name: 'link', type: TarEntryType.SYMLINK, linkname: '../external' },
        { name: 'link/subdir/file.txt', content: Buffer.from('escaped') },
      ]);

      const archive = path.join(tempDir, 'enoent-toctou.tar.xz');
      await saveAsXz(tar, archive);

      // Must reject: hasSymlinkAncestor must walk past the missing 'link/subdir'
      // and detect that 'link' itself is a symlink.
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // external/ must remain empty — no subdir/file.txt was created.
      const externalContents = await fs.readdir(externalDir);
      expect(externalContents).toHaveLength(0);

      // Confirm no file was written inside dest either
      const destContents = await fs.readdir(dest);
      // Only 'link' symlink was created (first entry), no subdir
      const hasBadFile = destContents.some((f) => f === 'subdir');
      expect(hasBadFile).toBe(false);
    });

    it('raw extract() yields traversal entry without rejecting (caller responsibility)', async () => {
      const tar = buildTar([{ name: '../../../tmp/evil.txt', content: Buffer.from('evil') }]);
      const archivePath = path.join(tempDir, 'evil.tar.xz');
      await saveAsXz(tar, archivePath);
      // Raw extract() does NOT reject path traversal — it yields the entry as-is.
      // Path safety is enforced by extractFile(), not extract().
      const entries = await collectExtract(archivePath);
      expect(entries[0]?.name).toContain('evil.txt');
    });

    it('propagates parse errors in extract()', async () => {
      const content = Buffer.from('Hello');
      const blocks: Array<Buffer | Uint8Array> = [];
      blocks.push(createHeader({ name: 'good.txt', size: content.length }));
      blocks.push(content);
      blocks.push(new Uint8Array(calculatePadding(content.length)));

      const bad = new Uint8Array(BLOCK_SIZE);
      bad[0] = 'X'.charCodeAt(0);
      bad[1] = 'Y'.charCodeAt(0);
      bad[2] = 'Z'.charCodeAt(0);
      blocks.push(bad);
      blocks.push(createEndOfArchive());

      const archive = path.join(tempDir, 'corrupt.tar.xz');
      await saveAsXz(buildTarRaw(blocks), archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow('checksum');
    });

    it('propagates parse errors in list()', async () => {
      const content = Buffer.from('Hello');
      const blocks: Array<Buffer | Uint8Array> = [];
      blocks.push(createHeader({ name: 'good.txt', size: content.length }));
      blocks.push(content);
      blocks.push(new Uint8Array(calculatePadding(content.length)));

      const bad = new Uint8Array(BLOCK_SIZE);
      bad[0] = 'X'.charCodeAt(0);
      bad[1] = 'Y'.charCodeAt(0);
      bad[2] = 'Z'.charCodeAt(0);
      blocks.push(bad);
      blocks.push(createEndOfArchive());

      const archive = path.join(tempDir, 'corrupt.tar.xz');
      await saveAsXz(buildTarRaw(blocks), archive);

      await expect(listFile(archive)).rejects.toThrow('checksum');
    });

    it('detects truncated file content (unexpected end)', async () => {
      const blocks: Array<Buffer | Uint8Array> = [];
      blocks.push(createHeader({ name: 'truncated.txt', size: 200 }));
      blocks.push(Buffer.alloc(50)); // Only 50 of 200 bytes

      const archive = path.join(tempDir, 'truncated.tar.xz');
      await saveAsXz(buildTarRaw(blocks), archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow('Unexpected end');
    });
  });

  // --- In-memory extract (replaces extractToMemory) ---

  describe('in-memory extract via extract() stream', () => {
    it('supports filter', async () => {
      const archive = path.join(tempDir, 'archive.tar.xz');
      await createFile(archive, {
        files: [
          { name: 'keep.txt', source: Buffer.from('Keep') },
          { name: 'skip.log', source: Buffer.from('Skip') },
        ],
      });

      const entries = await collectExtract(archive, {
        filter: (e) => e.name.endsWith('.txt'),
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]?.name).toBe('keep.txt');
    });

    it('supports strip', async () => {
      const archive = path.join(tempDir, 'archive.tar.xz');
      await createFile(archive, {
        files: [
          { name: 'prefix/', source: new Uint8Array(0) },
          { name: 'prefix/file.txt', source: Buffer.from('Content') },
        ],
      });

      const entries = await collectExtract(archive, { strip: 1 });
      const fileEntry = entries.find((e) => e.name === 'file.txt');
      expect(fileEntry).toBeDefined();
      expect(fileEntry?.content.toString()).toBe('Content');
    });
  });
});
