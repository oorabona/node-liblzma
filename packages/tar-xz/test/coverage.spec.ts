/**
 * Coverage completion tests — targeting all uncovered lines in tar-xz
 */
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { xzSync } from 'node-liblzma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create, extract, extractToMemory, list } from '../src/node/index.js';
import { parseOctal } from '../src/tar/checksum.js';
import {
  BLOCK_SIZE,
  calculatePadding,
  createEndOfArchive,
  createHeader,
  isUstarHeader,
  parseHeader,
} from '../src/tar/format.js';
import {
  applyPaxAttributes,
  createPaxData,
  createPaxHeaderBlocks,
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

describe('Coverage: isUstarHeader', () => {
  it('returns true for valid ustar header', () => {
    expect(isUstarHeader(createHeader({ name: 'test.txt' }))).toBe(true);
  });

  it('returns false for non-ustar data', () => {
    const buf = new Uint8Array(512);
    buf[0] = 1;
    expect(isUstarHeader(buf)).toBe(false);
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

describe('Coverage: createPaxHeaderBlocks', () => {
  it('creates parseable PAX header + data blocks', () => {
    const blocks = createPaxHeaderBlocks('file.txt', { path: 'very-long-file.txt' });
    expect(blocks.length).toBeGreaterThanOrEqual(2);

    const header = parseHeader(new Uint8Array(blocks[0]));
    expect(header).not.toBeNull();
    expect(header!.type).toBe(TarEntryType.PAX_HEADER);
    expect(header!.size).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Integration tests: Node API edge cases
// ===========================================================================

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
      const src = path.join(tempDir, 'src');
      await fs.mkdir(src);
      await fs.writeFile(path.join(src, 'target.txt'), 'content');
      await fs.symlink('target.txt', path.join(src, 'link.txt'));

      const archive = path.join(tempDir, 'archive.tar.xz');
      await create({ file: archive, cwd: src, files: ['target.txt', 'link.txt'] });

      // List
      const entries = await list({ file: archive });
      const linkEntry = entries.find((e) => e.name === 'link.txt');
      expect(linkEntry?.type).toBe(TarEntryType.SYMLINK);

      // Extract
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extract({ file: archive, cwd: dest });
      expect(await fs.readlink(path.join(dest, 'link.txt'))).toBe('target.txt');
    });

    it('replaces existing symlink on re-extract', async () => {
      const src = path.join(tempDir, 'src');
      await fs.mkdir(src);
      await fs.writeFile(path.join(src, 'target.txt'), 'content');
      await fs.symlink('target.txt', path.join(src, 'link.txt'));

      const archive = path.join(tempDir, 'archive.tar.xz');
      await create({ file: archive, cwd: src, files: ['target.txt', 'link.txt'] });

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extract({ file: archive, cwd: dest });
      // Re-extract — exercises the unlink-before-symlink path
      await extract({ file: archive, cwd: dest });
      expect(await fs.readlink(path.join(dest, 'link.txt'))).toBe('target.txt');
    });
  });

  // --- Empty files ---

  describe('empty files', () => {
    it('handles empty files through create/list/extract', async () => {
      const src = path.join(tempDir, 'src');
      await fs.mkdir(src);
      await fs.writeFile(path.join(src, 'empty.txt'), '');

      const archive = path.join(tempDir, 'archive.tar.xz');
      await create({ file: archive, cwd: src, files: ['empty.txt'] });

      const entries = await list({ file: archive });
      expect(entries[0].size).toBe(0);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extract({ file: archive, cwd: dest });
      expect((await fs.stat(path.join(dest, 'empty.txt'))).size).toBe(0);
    });
  });

  // --- Long filenames (PAX) ---

  describe('long filenames (PAX)', () => {
    it('roundtrips filenames > 255 chars via PAX headers', async () => {
      const src = path.join(tempDir, 'src');
      // 3 segments of 90 chars each → intermediate dirs < 100 chars (no prefix issues)
      // Full 3-level path = 273 chars → > 255 → triggers PAX
      const segments = ['a'.repeat(90), 'b'.repeat(90), 'c'.repeat(90)];
      const deepDir = segments.join('/');
      await fs.mkdir(path.join(src, deepDir), { recursive: true });
      await fs.writeFile(path.join(src, deepDir, 'file.txt'), 'deep');

      const archive = path.join(tempDir, 'archive.tar.xz');
      await create({ file: archive, cwd: src, files: [segments[0]] });

      // List should find the deeply nested file
      const entries = await list({ file: archive });
      const fileEntry = entries.find((e) => e.name.endsWith('file.txt'));
      expect(fileEntry).toBeDefined();

      // Extract and verify
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extract({ file: archive, cwd: dest });
      expect(await fs.readFile(path.join(dest, deepDir, 'file.txt'), 'utf-8')).toBe('deep');
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
      await extract({ file: archive, cwd: dest });

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
      await extract({ file: archive, cwd: dest });

      expect(await fs.readFile(path.join(dest, 'link.txt'), 'utf-8')).toBe('Hello');
    });

    it('handles PAX global headers gracefully', async () => {
      const globalPaxData = new TextEncoder().encode('30 SCHILY.xattr.test=value\n');

      const blocks: Array<Buffer | Uint8Array> = [];

      // Global PAX header (type 'g')
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

      // Regular file
      const content = Buffer.from('Hello');
      blocks.push(createHeader({ name: 'file.txt', size: content.length }));
      blocks.push(content);
      const fPad = calculatePadding(content.length);
      if (fPad > 0) blocks.push(new Uint8Array(fPad));

      blocks.push(createEndOfArchive());

      const archive = path.join(tempDir, 'archive.tar.xz');
      await saveAsXz(buildTarRaw(blocks), archive);

      // List should skip global PAX and show the file
      const entries = await list({ file: archive });
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('file.txt');

      // Extract should work
      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extract({ file: archive, cwd: dest });
      expect(await fs.readFile(path.join(dest, 'file.txt'), 'utf-8')).toBe('Hello');
    });

    it('handles crafted PAX extended headers in extract/list', async () => {
      // Use segments under FS limit but total path > 255 chars for PAX
      const longName = 'dir/' + 'a'.repeat(120) + '/' + 'b'.repeat(120) + '/file.txt';
      const tar = buildTar([{ name: longName, content: Buffer.from('PAX content'), usePax: true }]);

      const archive = path.join(tempDir, 'archive.tar.xz');
      await saveAsXz(tar, archive);

      const entries = await list({ file: archive });
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe(longName);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await extract({ file: archive, cwd: dest });
      expect(await fs.readFile(path.join(dest, longName), 'utf-8')).toBe('PAX content');
    });

    it('rejects path traversal', async () => {
      const tar = buildTar([{ name: '../../../tmp/evil.txt', content: Buffer.from('evil') }]);

      const archive = path.join(tempDir, 'archive.tar.xz');
      await saveAsXz(tar, archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await expect(extract({ file: archive, cwd: dest })).rejects.toThrow('Path traversal');
    });

    it('propagates parse errors in extract', async () => {
      // Valid header + content, then corrupted header
      const content = Buffer.from('Hello');
      const blocks: Array<Buffer | Uint8Array> = [];
      blocks.push(createHeader({ name: 'good.txt', size: content.length }));
      blocks.push(content);
      blocks.push(new Uint8Array(calculatePadding(content.length)));

      // Corrupted header: non-empty but invalid checksum
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
      await expect(extract({ file: archive, cwd: dest })).rejects.toThrow('checksum');
    });

    it('propagates parse errors in list', async () => {
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

      await expect(list({ file: archive })).rejects.toThrow('checksum');
    });

    it('detects truncated file content (unexpected end)', async () => {
      // Header says size=200 but we only provide 50 bytes
      const blocks: Array<Buffer | Uint8Array> = [];
      blocks.push(createHeader({ name: 'truncated.txt', size: 200 }));
      blocks.push(Buffer.alloc(50)); // Only 50 of 200 bytes

      const archive = path.join(tempDir, 'truncated.tar.xz');
      await saveAsXz(buildTarRaw(blocks), archive);

      const dest = path.join(tempDir, 'dest');
      await fs.mkdir(dest);
      await expect(extract({ file: archive, cwd: dest })).rejects.toThrow('Unexpected end');
    });
  });

  // --- extractToMemory ---

  describe('extractToMemory options', () => {
    it('supports filter', async () => {
      const src = path.join(tempDir, 'src');
      await fs.mkdir(src);
      await fs.writeFile(path.join(src, 'keep.txt'), 'Keep');
      await fs.writeFile(path.join(src, 'skip.log'), 'Skip');

      const archive = path.join(tempDir, 'archive.tar.xz');
      await create({ file: archive, cwd: src, files: ['keep.txt', 'skip.log'] });

      const entries = await extractToMemory(archive, {
        filter: (e) => e.name.endsWith('.txt'),
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('keep.txt');
    });

    it('supports strip', async () => {
      const src = path.join(tempDir, 'src');
      await fs.mkdir(path.join(src, 'prefix'), { recursive: true });
      await fs.writeFile(path.join(src, 'prefix', 'file.txt'), 'Content');

      const archive = path.join(tempDir, 'archive.tar.xz');
      await create({ file: archive, cwd: src, files: ['prefix'] });

      const entries = await extractToMemory(archive, { strip: 1 });
      const fileEntry = entries.find((e) => e.name === 'file.txt');
      expect(fileEntry).toBeDefined();
      expect(fileEntry!.content.toString()).toBe('Content');
    });
  });
});
