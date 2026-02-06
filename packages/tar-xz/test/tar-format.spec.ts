import { describe, expect, it } from 'vitest';
import {
  BLOCK_SIZE,
  calculateChecksum,
  calculatePadding,
  createEndOfArchive,
  createHeader,
  isEmptyBlock,
  parseHeader,
  verifyChecksum,
} from '../src/tar/format.js';
import { createPaxData, needsPaxHeaders, parsePaxData } from '../src/tar/pax.js';
import { TarEntryType } from '../src/types.js';

describe('TAR format', () => {
  describe('createHeader', () => {
    it('creates a valid 512-byte header', () => {
      const header = createHeader({ name: 'test.txt', size: 100 });
      expect(header.length).toBe(BLOCK_SIZE);
    });

    it('includes correct file name', () => {
      const header = createHeader({ name: 'test.txt' });
      const name = new TextDecoder().decode(header.subarray(0, 8));
      expect(name).toBe('test.txt');
    });

    it('sets correct type for files', () => {
      const header = createHeader({ name: 'test.txt' });
      expect(String.fromCharCode(header[156])).toBe(TarEntryType.FILE);
    });

    it('sets correct type for directories', () => {
      const header = createHeader({ name: 'testdir/' });
      expect(String.fromCharCode(header[156])).toBe(TarEntryType.DIRECTORY);
    });

    it('can override type explicitly', () => {
      const header = createHeader({ name: 'link', type: TarEntryType.SYMLINK, linkname: 'target' });
      expect(String.fromCharCode(header[156])).toBe(TarEntryType.SYMLINK);
    });

    it('includes USTAR magic', () => {
      const header = createHeader({ name: 'test.txt' });
      const magic = new TextDecoder().decode(header.subarray(257, 262));
      expect(magic).toBe('ustar');
    });

    it('handles long names with prefix', () => {
      const longPath =
        'very/long/directory/path/that/exceeds/one/hundred/characters/limit/file.txt';
      const header = createHeader({ name: longPath });

      const entry = parseHeader(header);
      expect(entry?.name).toBe(longPath);
    });

    it('throws for names too long for ustar format', () => {
      const tooLong = 'x'.repeat(300);
      expect(() => createHeader({ name: tooLong })).toThrow('too long');
    });
  });

  describe('parseHeader', () => {
    it('parses a created header correctly', () => {
      const header = createHeader({
        name: 'test.txt',
        size: 1234,
        mode: 0o755,
        uid: 1000,
        gid: 1000,
        uname: 'user',
        gname: 'group',
      });

      const entry = parseHeader(header);
      expect(entry).not.toBeNull();
      expect(entry?.name).toBe('test.txt');
      expect(entry?.size).toBe(1234);
      expect(entry?.mode).toBe(0o755);
      expect(entry?.uid).toBe(1000);
      expect(entry?.gid).toBe(1000);
      expect(entry?.uname).toBe('user');
      expect(entry?.gname).toBe('group');
      expect(entry?.type).toBe(TarEntryType.FILE);
    });

    it('returns null for empty block', () => {
      const empty = new Uint8Array(512);
      expect(parseHeader(empty)).toBeNull();
    });

    it('throws for invalid checksum', () => {
      const header = createHeader({ name: 'test.txt' });
      header[0] = 0xff; // Corrupt the header
      expect(() => parseHeader(header)).toThrow('checksum');
    });

    it('throws for wrong length', () => {
      const short = new Uint8Array(256);
      expect(() => parseHeader(short)).toThrow('length');
    });
  });

  describe('checksum', () => {
    it('calculates checksum correctly', () => {
      const header = createHeader({ name: 'test.txt' });
      expect(verifyChecksum(header)).toBe(true);
    });

    it('detects corrupted headers', () => {
      const header = createHeader({ name: 'test.txt' });
      header[10] = (header[10] + 1) % 256;
      expect(verifyChecksum(header)).toBe(false);
    });

    it('throws for invalid length', () => {
      const short = new Uint8Array(100);
      expect(() => calculateChecksum(short)).toThrow('length');
    });
  });

  describe('isEmptyBlock', () => {
    it('returns true for all zeros', () => {
      expect(isEmptyBlock(new Uint8Array(512))).toBe(true);
    });

    it('returns false for non-zero content', () => {
      const block = new Uint8Array(512);
      block[100] = 1;
      expect(isEmptyBlock(block)).toBe(false);
    });
  });

  describe('calculatePadding', () => {
    it('returns 0 for block-aligned sizes', () => {
      expect(calculatePadding(0)).toBe(0);
      expect(calculatePadding(512)).toBe(0);
      expect(calculatePadding(1024)).toBe(0);
    });

    it('returns correct padding for non-aligned sizes', () => {
      expect(calculatePadding(1)).toBe(511);
      expect(calculatePadding(100)).toBe(412);
      expect(calculatePadding(500)).toBe(12);
      expect(calculatePadding(513)).toBe(511);
    });
  });

  describe('createEndOfArchive', () => {
    it('creates two empty blocks', () => {
      const eof = createEndOfArchive();
      expect(eof.length).toBe(1024);
      expect(isEmptyBlock(eof.subarray(0, 512))).toBe(true);
      expect(isEmptyBlock(eof.subarray(512, 1024))).toBe(true);
    });
  });
});

describe('PAX extended headers', () => {
  describe('createPaxData / parsePaxData', () => {
    it('round-trips simple attributes', () => {
      const attrs = { path: 'test.txt', size: 12345 };
      const data = createPaxData(attrs);
      const parsed = parsePaxData(data);

      expect(parsed.path).toBe('test.txt');
      expect(parsed.size).toBe(12345);
    });

    it('handles long paths', () => {
      const longPath = `${'a'.repeat(500)}/file.txt`;
      const attrs = { path: longPath };
      const data = createPaxData(attrs);
      const parsed = parsePaxData(data);

      expect(parsed.path).toBe(longPath);
    });

    it('handles multiple attributes', () => {
      const attrs = {
        path: '/long/path/file.txt',
        linkpath: '/another/long/link',
        uid: 65534,
        gid: 65534,
        uname: 'nobody',
        gname: 'nogroup',
      };
      const data = createPaxData(attrs);
      const parsed = parsePaxData(data);

      expect(parsed.path).toBe(attrs.path);
      expect(parsed.linkpath).toBe(attrs.linkpath);
      expect(parsed.uid).toBe(attrs.uid);
      expect(parsed.gid).toBe(attrs.gid);
      expect(parsed.uname).toBe(attrs.uname);
      expect(parsed.gname).toBe(attrs.gname);
    });

    it('handles mtime with fractional seconds', () => {
      const attrs = { mtime: 1234567890.123456 };
      const data = createPaxData(attrs);
      const parsed = parsePaxData(data);

      expect(parsed.mtime).toBeCloseTo(1234567890.123456, 5);
    });
  });

  describe('needsPaxHeaders', () => {
    it('returns false for short names', () => {
      expect(needsPaxHeaders({ name: 'short.txt' })).toBe(false);
    });

    it('returns true for names > 255 chars', () => {
      const longName = 'x'.repeat(256);
      expect(needsPaxHeaders({ name: longName })).toBe(true);
    });

    it('returns true for long link names', () => {
      expect(needsPaxHeaders({ name: 'link', linkname: 'x'.repeat(101) })).toBe(true);
    });

    it('returns true for large file sizes', () => {
      // > 8GB (maximum for 11-digit octal)
      expect(needsPaxHeaders({ name: 'big.bin', size: 9 * 1024 * 1024 * 1024 })).toBe(true);
    });

    it('returns false for max octal size', () => {
      // 0o77777777777 = 8589934591 bytes (~8GB) is the max for 11-digit octal
      expect(needsPaxHeaders({ name: 'big.bin', size: 0o77777777777 })).toBe(false);
    });
  });
});
