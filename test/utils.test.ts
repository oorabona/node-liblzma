/**
 * Tests for utility functions: isXZ, versionString, versionNumber,
 * easyEncoderMemusage, easyDecoderMemusage, parseFileIndex
 */

import { describe, expect, it } from 'vitest';
import {
  check,
  easyDecoderMemusage,
  easyEncoderMemusage,
  isXZ,
  parseFileIndex,
  preset,
  versionNumber,
  versionString,
  xzSync,
} from '../lib/lzma.js';

describe('isXZ', () => {
  it('should return true for XZ compressed data', () => {
    const compressed = xzSync(Buffer.from('Hello, World!'));
    expect(isXZ(compressed)).toBe(true);
  });

  it('should return false for plain text', () => {
    expect(isXZ(Buffer.from('Hello, World!'))).toBe(false);
  });

  it('should return false for buffer smaller than 6 bytes', () => {
    expect(isXZ(Buffer.from('Hi'))).toBe(false);
  });

  it('should return false for empty buffer', () => {
    expect(isXZ(Buffer.alloc(0))).toBe(false);
  });

  it('should detect XZ magic bytes correctly', () => {
    // XZ magic: 0xFD + "7zXZ" + 0x00
    const xzMagic = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
    expect(isXZ(xzMagic)).toBe(true);
  });

  it('should reject gzip data', () => {
    // Gzip magic: 0x1f 0x8b
    const gzipMagic = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00]);
    expect(isXZ(gzipMagic)).toBe(false);
  });
});

describe('versionString', () => {
  it('should return a version string', () => {
    const version = versionString();
    expect(typeof version).toBe('string');
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should return a valid semver-like version', () => {
    const version = versionString();
    const parts = version.split('.');
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(Number.parseInt(parts[0], 10)).toBeGreaterThanOrEqual(5);
  });
});

describe('versionNumber', () => {
  it('should return a version number', () => {
    const version = versionNumber();
    expect(typeof version).toBe('number');
    expect(version).toBeGreaterThan(0);
  });

  it('should be consistent with versionString', () => {
    const numVersion = versionNumber();
    const strVersion = versionString();

    // Parse: MAJOR * 10000000 + MINOR * 10000 + PATCH * 10
    const major = Math.floor(numVersion / 10000000);
    const minor = Math.floor((numVersion % 10000000) / 10000);
    const patch = Math.floor((numVersion % 10000) / 10);

    const expectedPrefix = `${major}.${minor}.${patch}`;
    expect(strVersion.startsWith(expectedPrefix)).toBe(true);
  });
});

describe('easyEncoderMemusage', () => {
  it('should return memory usage for preset 6 (default)', () => {
    const memusage = easyEncoderMemusage(6);
    expect(typeof memusage).toBe('number');
    expect(memusage).toBeGreaterThan(0);
  });

  it('should return increasing memory for higher presets', () => {
    const mem0 = easyEncoderMemusage(0);
    const mem6 = easyEncoderMemusage(6);
    const mem9 = easyEncoderMemusage(9);

    expect(mem6).toBeGreaterThan(mem0);
    expect(mem9).toBeGreaterThan(mem6);
  });

  it('should return higher memory for EXTREME preset', () => {
    const memNormal = easyEncoderMemusage(6);
    const memExtreme = easyEncoderMemusage(6 | preset.EXTREME);

    expect(memExtreme).toBeGreaterThanOrEqual(memNormal);
  });

  it('should return UINT32_MAX for invalid preset', () => {
    // Preset > 9 without EXTREME flag is invalid
    // liblzma returns UINT32_MAX (not 0) for invalid presets
    const memusage = easyEncoderMemusage(99);
    expect(memusage).toBe(4294967295); // UINT32_MAX
  });
});

describe('easyDecoderMemusage', () => {
  it('should return memory usage', () => {
    const memusage = easyDecoderMemusage();
    expect(typeof memusage).toBe('number');
    expect(memusage).toBeGreaterThan(0);
  });

  it('should return a reasonable value', () => {
    const memusage = easyDecoderMemusage();
    // Decoder typically needs less memory than encoder
    // Should be at least 1 MB but less than 100 MB
    expect(memusage).toBeGreaterThan(1024 * 1024);
    expect(memusage).toBeLessThan(100 * 1024 * 1024);
  });
});

describe('parseFileIndex', () => {
  it('should parse index from compressed buffer', () => {
    const original = Buffer.from('Hello, World! This is a test of the XZ compression.');
    const compressed = xzSync(original);

    const info = parseFileIndex(compressed);

    expect(info.uncompressedSize).toBe(original.length);
    expect(info.compressedSize).toBeGreaterThan(0);
    expect(info.streamCount).toBe(1);
    expect(info.blockCount).toBeGreaterThanOrEqual(1);
    // Default check type depends on how xzSync is configured - just verify it's a valid value
    expect([check.NONE, check.CRC32, check.CRC64, check.SHA256]).toContain(info.check);
    expect(info.memoryUsage).toBeGreaterThan(0);
  });

  it('should return correct uncompressed size for larger data', () => {
    const original = Buffer.alloc(10000, 'x');
    const compressed = xzSync(original);

    const info = parseFileIndex(compressed);

    expect(info.uncompressedSize).toBe(10000);
  });

  it('should throw for non-XZ buffer', () => {
    const notXz = Buffer.from('This is not an XZ file');
    expect(() => parseFileIndex(notXz)).toThrow();
  });

  it('should throw for buffer too small', () => {
    const tooSmall = Buffer.from('Hi');
    expect(() => parseFileIndex(tooSmall)).toThrow(/too small/i);
  });

  it('should throw for truncated XZ file', () => {
    const compressed = xzSync(Buffer.from('Hello'));
    // Truncate to corrupt the file
    const truncated = compressed.subarray(0, compressed.length - 5);
    expect(() => parseFileIndex(truncated)).toThrow();
  });

  it('should correctly report check type', () => {
    const original = Buffer.from('Test data');

    // Test with different check types
    const withCrc32 = xzSync(original, { check: check.CRC32 });
    const withSha256 = xzSync(original, { check: check.SHA256 });

    expect(parseFileIndex(withCrc32).check).toBe(check.CRC32);
    expect(parseFileIndex(withSha256).check).toBe(check.SHA256);
  });
});
