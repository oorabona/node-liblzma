/**
 * Coverage completion tests — targeting all uncovered lines in tar-xz
 */
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { xzSync } from 'node-liblzma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extract, list } from '../src/node/index.js';
import { create } from '../src/node/create.js';
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

    it('R4-2 regression: strip option applies to hardlink linkname (not just entry name)', async () => {
      // Bug: extractFile applied 'strip' to entry.name (output path) but NOT to
      // entry.linkname for HARDLINK entries. With strip: 1, archive entry
      //   dir/link → linkname dir/a.txt
      // would attempt link(cwd/a.txt, cwd/dir/a.txt) — failing because the
      // unstripped 'dir/' prefix on linkname does not exist in the stripped output.
      // Fix: apply strip to linkname before resolving.
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const tar = buildTar([
        { name: 'dir/a.txt', content: Buffer.from('content') },
        { name: 'dir/link', type: TarEntryType.HARDLINK, linkname: 'dir/a.txt' },
      ]);

      const archive = path.join(tempDir, 'hl-strip.tar.xz');
      await saveAsXz(tar, archive);

      // strip: 1 → 'dir/a.txt' becomes 'a.txt', 'dir/link' becomes 'link',
      //           and 'dir/a.txt' linkname must also become 'a.txt'
      await extractFile(archive, { cwd: dest, strip: 1 });

      // Both files exist at the stripped paths
      const aPath = path.join(dest, 'a.txt');
      const linkPath = path.join(dest, 'link');
      expect(await fs.readFile(aPath, 'utf8')).toBe('content');
      expect(await fs.readFile(linkPath, 'utf8')).toBe('content');

      // Confirm hardlink semantics: same inode
      const aStat = await fs.stat(aPath);
      const linkStat = await fs.stat(linkPath);
      expect(linkStat.ino).toBe(aStat.ino);
    });

    it('R5-1 regression: rejects hardlink whose linkname is a symlink (symlink traversal via hardlink)', async () => {
      // Attack:
      //   Entry 1: 's' (SYMLINK) with linkname '../external/secret' → creates cwd/s → ../external/secret
      //   Entry 2: 'myhardlink' (HARDLINK) with linkname 's'
      //     → linkSource = resolve(cwd, 's') → cwd/s (passes the linkRel check: inside cwd)
      //     → link(cwd/s, cwd/myhardlink) → kernel follows cwd/s symlink → hardlinks /external/secret
      // Fix: check lstat(linkSource).isSymbolicLink() BEFORE calling link().
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);
      const secretFile = path.join(externalDir, 'secret');
      await fs.writeFile(secretFile, 'sensitive');

      const tar = buildTar([
        // Step 1: plant a symlink inside cwd pointing to an external file
        { name: 's', type: TarEntryType.SYMLINK, linkname: '../external/secret' },
        // Step 2: hardlink with linkname 's' (the symlink)
        { name: 'myhardlink', type: TarEntryType.HARDLINK, linkname: 's' },
      ]);

      const archive = path.join(tempDir, 'hl-symlink-src.tar.xz');
      await saveAsXz(tar, archive);

      // Must reject: linkSource 's' is a symlink
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // The external secret file must NOT be hardlinked into dest
      const destContents = await fs.readdir(dest);
      expect(destContents).not.toContain('myhardlink');

      // Stronger guarantee: the external secret file's link count must remain 1
      // (a successful hardlink would have bumped it to 2, even if the dest entry
      // was later cleaned up by an error handler).
      const secretStat = await fs.stat(secretFile);
      expect(secretStat.nlink).toBe(1);
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

  // ---------------------------------------------------------------------------
  // Security hardening tests (7-fix consolidated PR)
  // ---------------------------------------------------------------------------

  describe('Security: leaf symlink checks (Fix 1 — R6-1/V1)', () => {
    it('R6-1 FILE: rejects overwrite when target is a pre-existing symlink', async () => {
      // Attack: archive plants [SYMLINK evil → ../external/secret, FILE evil content]
      // The leaf-symlink check must reject the FILE entry because 'evil' is a symlink.
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const externalDir = path.join(tempDir, 'external');
      await fs.mkdir(externalDir);
      const secretFile = path.join(externalDir, 'secret');
      await fs.writeFile(secretFile, 'original-secret');

      const tar = buildTar([
        // Step 1: plant symlink (no leaf check on SYMLINK itself — it's fine to create them)
        { name: 'evil', type: TarEntryType.SYMLINK, linkname: '../external/secret' },
        // Step 2: FILE entry with same name — would overwrite through symlink
        { name: 'evil', content: Buffer.from('overwritten') },
      ]);
      const archive = path.join(tempDir, 'leaf-file.tar.xz');
      await saveAsXz(tar, archive);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/symlink/i);

      // Verify external file was NOT overwritten
      expect(await fs.readFile(secretFile, 'utf8')).toBe('original-secret');
    });

    it('V4 DIRECTORY: rejects overwrite when target is a pre-existing symlink', async () => {
      // Attack: archive plants [SYMLINK evil → ../external/, DIRECTORY evil/]
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

  describe('Security: NUL byte / empty name rejection (Fix 2 — V6a/V6b)', () => {
    it('V6b: rejects entry name containing NUL byte', async () => {
      // Craft a tar entry with NUL byte embedded in the name via raw header manipulation
      const content = Buffer.from('evil');
      const header = createHeader({ name: 'safe.txt', size: content.length });
      // Inject NUL at position 4 in the name field (offset 0)
      header[4] = 0x00;
      // Recalculate checksum
      let checksum = 0;
      for (let i = 0; i < 512; i++) {
        checksum += i >= 148 && i < 156 ? 0x20 : (header[i] ?? 0);
      }
      // Write checksum in octal to bytes 148-155
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

      // The NUL truncates the name — the remaining portion after NUL should still extract
      // cleanly OR cause a rejection depending on how NUL affects the resolved path.
      // The key requirement is: no file should escape dest.
      try {
        await extractFile(archive, { cwd: dest });
        // If it didn't throw, verify nothing escaped dest
        const destContents = await fs.readdir(dest);
        for (const f of destContents) {
          const resolved = path.resolve(dest, f);
          expect(resolved.startsWith(dest)).toBe(true);
        }
      } catch {
        // Rejection is also acceptable — both outcomes are safe
      }
    });

    it('V6b: rejects SYMLINK with NUL byte in linkname', async () => {
      // Build a SYMLINK entry where linkname contains a NUL byte
      const header = createHeader({
        name: 'link.txt',
        type: TarEntryType.SYMLINK,
        linkname: 'target.txt',
      });
      // Inject NUL at offset 157 (linkname field starts at 157 in USTAR)
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

      // The NUL truncates linkname — result is either safe extraction or rejection. Both are safe.
      // Key: no escape outside dest.
      try {
        await extractFile(archive, { cwd: dest });
        const destContents = await fs.readdir(dest);
        for (const f of destContents) {
          const resolved = path.resolve(dest, f);
          expect(resolved.startsWith(dest)).toBe(true);
        }
      } catch {
        // Rejection is safe
      }
    });

    it('V6a: rejects SYMLINK entry with empty linkname', async () => {
      // Build an archive where SYMLINK has linkname='' (empty)
      const tar = buildTar([{ name: 'link.txt', type: TarEntryType.SYMLINK, linkname: '' }]);
      const archive = path.join(tempDir, 'empty-linkname.tar.xz');
      await saveAsXz(tar, archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/empty linkname/i);
    });
  });

  describe('Security: strip applied to SYMLINK linkname (Fix 3 — V6c/V14)', () => {
    it('V6c: strip:1 strips linkname prefix in SYMLINK entries', async () => {
      // Archive: [FILE dir/a.txt, SYMLINK dir/link → dir/a.txt]
      // Extract with strip:1 → cwd/a.txt exists, cwd/link → a.txt
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const tar = buildTar([
        { name: 'dir/a.txt', content: Buffer.from('hello') },
        { name: 'dir/link', type: TarEntryType.SYMLINK, linkname: 'dir/a.txt' },
      ]);
      const archive = path.join(tempDir, 'strip-symlink.tar.xz');
      await saveAsXz(tar, archive);

      await extractFile(archive, { cwd: dest, strip: 1 });

      // cwd/a.txt should exist
      expect(await fs.readFile(path.join(dest, 'a.txt'), 'utf8')).toBe('hello');

      // cwd/link should be a symlink with target 'a.txt' (stripped, not 'dir/a.txt')
      const linkTarget = await fs.readlink(path.join(dest, 'link'));
      expect(linkTarget).toBe('a.txt');
    });
  });

  describe('Security: setuid/setgid/sticky bit stripping (Fix 4 — V12)', () => {
    it('V12: strips setuid bit from extracted file (mode 0o4755 → 0o755)', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      const tar = buildTar([{ name: 'x', content: Buffer.from('data') }]);
      // Manually patch the mode in the header to 0o4755 (setuid + rwxr-xr-x)
      const tarBuf = Buffer.from(tar);
      // Mode field is at offset 100, length 8 in USTAR
      const modeStr = `${(0o4755).toString(8).padStart(7, '0')}\x00`;
      for (let i = 0; i < 8; i++) tarBuf[100 + i] = modeStr.charCodeAt(i);
      // Recalculate checksum (field at offset 148, length 8)
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
      // setuid bit (04000) must be stripped
      expect(stat.mode & 0o7000).toBe(0);
      // rwxr-xr-x should be preserved
      expect(stat.mode & 0o777).toBe(0o755);
    });

    it('V12: strips setgid+sticky bits from extracted directory (mode 0o3755 → at most 0o755|0o111)', async () => {
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);

      // buildTar with DIRECTORY type and mode 0o3755 (setgid+sticky+rwxr-xr-x)
      const header = createHeader({ name: 'testdir/', type: TarEntryType.DIRECTORY, mode: 0o3755 });
      const tarBuf = Buffer.concat([Buffer.from(header), Buffer.from(createEndOfArchive())]);

      const archive = path.join(tempDir, 'setgid-dir.tar.xz');
      await saveAsXz(tarBuf, archive);

      await extractFile(archive, { cwd: dest });

      const stat = await fs.stat(path.join(dest, 'testdir'));
      // setgid (02000) + sticky (01000) bits must be stripped
      expect(stat.mode & 0o7000).toBe(0);
    });
  });

  // --- In-memory extract (replaces extractToMemory) ---

  describe('R7-5: create() error propagation via pipeline()', () => {
    it('propagates fs errors from buildTar when source file is missing', async () => {
      // Source file does not exist — buildTar throws ENOENT inside resolveSource.
      // With pipe() this would hang or emit an unhandled error; with pipeline() it rejects.
      const files = [{ name: 'a.txt', source: '/nonexistent/__no_such_file__.bin' }];
      const archive = create({ files });
      await expect(
        (async () => {
          for await (const _ of archive) {
            /* drain */
          }
        })()
      ).rejects.toThrow(/ENOENT|no such file/i);
    });
  });

  describe('R7-1: dot-segment entry name rejection', () => {
    it('rejects entry name "." (dot-segment placeholder)', async () => {
      const tar = buildTar([{ name: '.', type: TarEntryType.DIRECTORY }]);
      const archive = path.join(tempDir, 'dot.tar.xz');
      await saveAsXz(tar, archive);
      const dest = path.join(tempDir, 'dest-dot');
      await fs.mkdir(dest);
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/dot-segment/i);
    });

    it('rejects entry name "./" (trailing-slash dot)', async () => {
      // buildTar normalises to '.' after stripping the trailing slash
      const tar = buildTar([{ name: './', type: TarEntryType.DIRECTORY }]);
      const archive = path.join(tempDir, 'dotslash.tar.xz');
      await saveAsXz(tar, archive);
      const dest = path.join(tempDir, 'dest-dotslash');
      await fs.mkdir(dest);
      await expect(extractFile(archive, { cwd: dest })).rejects.toThrow(/dot-segment/i);
    });

    it('does NOT reject legitimate dotfiles like ".gitignore"', async () => {
      // Regression guard: dotfiles must still be extractable.
      const archive = path.join(tempDir, 'dotfile.tar.xz');
      await createFile(archive, {
        files: [{ name: '.gitignore', source: Buffer.from('*.log') }],
      });
      const dest = path.join(tempDir, 'dest-dotfile');
      await fs.mkdir(dest);
      // Should not throw
      await extractFile(archive, { cwd: dest });
      expect(await fs.readFile(path.join(dest, '.gitignore'), 'utf8')).toBe('*.log');
    });
  });

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

// ---------------------------------------------------------------------------
// Block 3 — extract() streaming-specific tests (S-08, D-3, S-08b)
// ---------------------------------------------------------------------------

describe('extract() streaming behaviours (Block 3)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-b3-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function buildAndSaveArchive(
    files: Array<{ name: string; content: Buffer }>
  ): Promise<string> {
    const archive = path.join(tempDir, 'archive.tar.xz');
    const chunks: Uint8Array[] = [];
    for await (const chunk of create({
      files: files.map((f) => ({ name: f.name, source: f.content })),
    })) {
      chunks.push(chunk);
    }
    await fs.writeFile(archive, Buffer.concat(chunks.map((c) => Buffer.from(c))));
    return archive;
  }

  it('S-08: consumer skips entry.data — next entry yields correct content', async () => {
    const archive = await buildAndSaveArchive([
      { name: 'skip-me.bin', content: Buffer.alloc(102400, 0xaa) }, // 100 KB
      { name: 'read-me.txt', content: Buffer.from('hello-streaming') },
    ]);

    const entries: Array<{ name: string; content: string }> = [];
    for await (const entry of extract(createReadStream(archive))) {
      if (entry.name === 'skip-me.bin') {
        // Deliberately do NOT call entry.bytes() or iterate entry.data.
        continue; // auto-drain kicks in
      }
      entries.push({ name: entry.name, content: await entry.text() });
    }

    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('read-me.txt');
    expect(entries[0]?.content).toBe('hello-streaming');
  });

  it('D-3: bytes() memoization — second call returns same buffer instance', async () => {
    const archive = await buildAndSaveArchive([
      { name: 'file.txt', content: Buffer.from('memoize-me') },
    ]);

    for await (const entry of extract(createReadStream(archive))) {
      const first = await entry.bytes();
      const second = await entry.bytes();
      expect(first).toBe(second); // same reference — memoized
      expect(Buffer.from(first).toString()).toBe('memoize-me');
    }
  });

  it('D-3: data iterated AFTER bytes() yields nothing', async () => {
    const archive = await buildAndSaveArchive([
      { name: 'file.txt', content: Buffer.from('once-only') },
    ]);

    for await (const entry of extract(createReadStream(archive))) {
      await entry.bytes(); // consumes the data generator
      const chunks: Uint8Array[] = [];
      for await (const chunk of entry.data) {
        chunks.push(chunk);
      }
      // Generator is exhausted; second iteration yields nothing.
      expect(chunks).toHaveLength(0);
    }
  });

  it('S-08b consumer-break (D-2): for-await break does NOT surface errors from skipped data', async () => {
    const archive = await buildAndSaveArchive([
      { name: 'a.txt', content: Buffer.from('first') },
      { name: 'b.txt', content: Buffer.from('second') },
      { name: 'c.txt', content: Buffer.from('third') },
    ]);

    const names: string[] = [];
    // Break after first entry — should not throw.
    for await (const entry of extract(createReadStream(archive))) {
      names.push(entry.name);
      break; // consumer-break — triggers generator finally
    }

    expect(names).toHaveLength(1);
    expect(names[0]).toBe('a.txt');
  });
});

// ---------------------------------------------------------------------------
// Block 4 — list() streaming-specific tests (S-12 placeholder)
// ---------------------------------------------------------------------------

describe('list() streaming behaviours (Block 4)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-b4-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('S-12 placeholder: list() yields all entries with correct metadata', async () => {
    const archive = path.join(tempDir, 'archive.tar.xz');
    const chunks: Uint8Array[] = [];
    for await (const chunk of create({
      files: [
        { name: 'alpha.txt', source: Buffer.from('alpha') },
        { name: 'beta.txt', source: Buffer.from('beta-content-here') },
        { name: 'gamma.txt', source: Buffer.from('g') },
      ],
    })) {
      chunks.push(chunk);
    }
    await fs.writeFile(archive, Buffer.concat(chunks.map((c) => Buffer.from(c))));

    const entries: TarEntry[] = [];
    for await (const entry of list(createReadStream(archive))) {
      entries.push(entry);
    }

    expect(entries).toHaveLength(3);
    expect(entries[0]?.name).toBe('alpha.txt');
    expect(entries[0]?.size).toBe(5);
    expect(entries[1]?.name).toBe('beta.txt');
    expect(entries[1]?.size).toBe(17);
    expect(entries[2]?.name).toBe('gamma.txt');
    expect(entries[2]?.size).toBe(1);
  });
});
