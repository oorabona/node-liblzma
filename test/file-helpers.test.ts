/**
 * Tests for file-based compression/decompression helpers
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unxzFile, xzFile } from '../src/lzma.js';

describe('File Helpers', () => {
  let testFile: string;
  let compressedFile: string;
  let decompressedFile: string;
  const testContent = 'Test content for file compression\n'.repeat(100);

  beforeEach(() => {
    const tempDir = tmpdir();
    testFile = join(tempDir, `test-${Date.now()}.txt`);
    compressedFile = join(tempDir, `test-${Date.now()}.xz`);
    decompressedFile = join(tempDir, `test-${Date.now()}-out.txt`);

    writeFileSync(testFile, testContent);
  });

  afterEach(() => {
    [testFile, compressedFile, decompressedFile].forEach((file) => {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    });
  });

  describe('xzFile', () => {
    it('should compress a file', async () => {
      await xzFile(testFile, compressedFile);

      expect(existsSync(compressedFile)).toBe(true);
      const compressed = readFileSync(compressedFile);
      expect(compressed.length).toBeGreaterThan(0);
      expect(compressed.length).toBeLessThan(testContent.length);
    });

    it('should handle large files', async () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      writeFileSync(testFile, largeContent);

      await xzFile(testFile, compressedFile);

      expect(existsSync(compressedFile)).toBe(true);
      const compressed = readFileSync(compressedFile);
      expect(compressed.length).toBeLessThan(largeContent.length);
    });

    it('should respect compression options', async () => {
      await xzFile(testFile, compressedFile, { preset: 9 });

      expect(existsSync(compressedFile)).toBe(true);
    });
  });

  describe('unxzFile', () => {
    it('should decompress a file', async () => {
      await xzFile(testFile, compressedFile);
      await unxzFile(compressedFile, decompressedFile);

      expect(existsSync(decompressedFile)).toBe(true);
      const decompressed = readFileSync(decompressedFile, 'utf-8');
      expect(decompressed).toBe(testContent);
    });

    it('should handle compressed large files', async () => {
      const largeContent = 'Large file content\n'.repeat(10000);
      writeFileSync(testFile, largeContent);

      await xzFile(testFile, compressedFile);
      await unxzFile(compressedFile, decompressedFile);

      const decompressed = readFileSync(decompressedFile, 'utf-8');
      expect(decompressed).toBe(largeContent);
    });
  });

  describe('Round-trip', () => {
    it('should preserve file content through compress/decompress cycle', async () => {
      await xzFile(testFile, compressedFile);
      await unxzFile(compressedFile, decompressedFile);

      const original = readFileSync(testFile, 'utf-8');
      const roundtrip = readFileSync(decompressedFile, 'utf-8');

      expect(roundtrip).toBe(original);
    });

    it('should handle binary data correctly', async () => {
      const binaryData = Buffer.from([0, 1, 2, 3, 255, 254, 253]);
      writeFileSync(testFile, binaryData);

      await xzFile(testFile, compressedFile);
      await unxzFile(compressedFile, decompressedFile);

      const roundtrip = readFileSync(decompressedFile);
      expect(roundtrip.equals(binaryData)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should reject for non-existent input file', async () => {
      await expect(xzFile('/nonexistent/file.txt', compressedFile)).rejects.toThrow();
    });

    it('should reject for invalid compressed file', async () => {
      writeFileSync(compressedFile, 'not a valid xz file');
      await expect(unxzFile(compressedFile, decompressedFile)).rejects.toThrow();
    });
  });
});
