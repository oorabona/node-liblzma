/**
 * Block 5 Tests — Utility Functions
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { xzAsync } from '../../src/wasm/compress.js';
import {
  easyDecoderMemusage,
  easyEncoderMemusage,
  isXZ,
  parseFileIndex,
  versionNumber,
  versionString,
} from '../../src/wasm/utils.js';
import { loadWasmModule, unloadWasmModule } from './wasm-helpers.utils.js';

describe('WASM Utils (Block 5)', () => {
  beforeAll(async () => {
    await loadWasmModule();
  });

  afterAll(() => {
    unloadWasmModule();
  });

  describe('isXZ', () => {
    it('should detect XZ compressed data', async () => {
      const compressed = await xzAsync('test');
      expect(isXZ(compressed)).toBe(true);
    });

    it('should reject plain text', () => {
      expect(isXZ(new TextEncoder().encode('Hello'))).toBe(false);
    });

    it('should reject too-short buffer', () => {
      expect(isXZ(new Uint8Array(3))).toBe(false);
    });

    it('should reject empty buffer', () => {
      expect(isXZ(new Uint8Array(0))).toBe(false);
    });

    it('should detect XZ magic bytes directly', () => {
      const magic = new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
      expect(isXZ(magic)).toBe(true);
    });

    it('should accept ArrayBuffer input', async () => {
      const compressed = await xzAsync('test');
      expect(isXZ(compressed.buffer as ArrayBuffer)).toBe(true);
    });
  });

  describe('versionString', () => {
    it('should return a semver-like string', () => {
      const v = versionString();
      expect(v).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('versionNumber', () => {
    it('should return a numeric version', () => {
      const n = versionNumber();
      expect(n).toBeGreaterThan(0);
      // Should be consistent with versionString
      const s = versionString();
      const parts = s.split('.');
      const expected =
        Number.parseInt(parts[0], 10) * 10000000 +
        Number.parseInt(parts[1], 10) * 10000 +
        Number.parseInt(parts[2], 10) * 10;
      expect(n).toBe(expected);
    });
  });

  describe('easyEncoderMemusage', () => {
    it('should return memory usage for preset 6', () => {
      expect(easyEncoderMemusage(6)).toBeGreaterThan(0);
    });

    it('should increase with higher presets', () => {
      const m0 = easyEncoderMemusage(0);
      const m6 = easyEncoderMemusage(6);
      const m9 = easyEncoderMemusage(9);
      expect(m6).toBeGreaterThan(m0);
      expect(m9).toBeGreaterThan(m6);
    });
  });

  describe('easyDecoderMemusage', () => {
    it('should return a positive number', () => {
      expect(easyDecoderMemusage()).toBeGreaterThan(0);
    });
  });

  describe('parseFileIndex', () => {
    it('should parse a valid XZ file index', async () => {
      const compressed = await xzAsync('Hello, parseFileIndex!');
      const index = parseFileIndex(compressed);
      expect(index.compressedSize).toBe(compressed.byteLength);
      expect(index.streamCount).toBe(1);
      expect(index.check).toBeGreaterThanOrEqual(0);
    });

    it('should return correct uncompressedSize', async () => {
      const input = 'Hello, parseFileIndex!';
      const inputBytes = new TextEncoder().encode(input);
      const compressed = await xzAsync(input);
      const index = parseFileIndex(compressed);
      expect(index.uncompressedSize).toBe(inputBytes.byteLength);
    });

    it('should return correct blockCount', async () => {
      const compressed = await xzAsync('test block count');
      const index = parseFileIndex(compressed);
      expect(index.blockCount).toBe(1);
    });

    it('should handle larger data correctly', async () => {
      const largeInput = 'A'.repeat(100_000);
      const inputBytes = new TextEncoder().encode(largeInput);
      const compressed = await xzAsync(largeInput);
      const index = parseFileIndex(compressed);
      expect(index.uncompressedSize).toBe(inputBytes.byteLength);
      expect(index.blockCount).toBeGreaterThanOrEqual(1);
      expect(index.compressedSize).toBeLessThan(inputBytes.byteLength);
    });

    it('should throw on non-XZ data', () => {
      expect(() => parseFileIndex(new Uint8Array([1, 2, 3, 4]))).toThrow(/Not a valid XZ file/);
    });

    it('should throw on too-small XZ data', () => {
      const magic = new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
      expect(() => parseFileIndex(magic)).toThrow(/too small/);
    });

    it('should throw on invalid XZ footer magic bytes', async () => {
      const compressed = await xzAsync('footer test');
      const corrupted = new Uint8Array(compressed);
      // Corrupt the footer magic 'YZ' (last 2 bytes)
      corrupted[corrupted.byteLength - 1] = 0x00;
      corrupted[corrupted.byteLength - 2] = 0x00;
      expect(() => parseFileIndex(corrupted)).toThrow(/Invalid XZ footer/);
    });

    it('should throw on invalid backward size', async () => {
      const compressed = await xzAsync('backward size test');
      const corrupted = new Uint8Array(compressed);
      // Set backward size bytes (footer offset 4-7) to a huge value
      // that would place the index outside the file
      corrupted[corrupted.byteLength - 8] = 0xff;
      corrupted[corrupted.byteLength - 7] = 0xff;
      corrupted[corrupted.byteLength - 6] = 0xff;
      corrupted[corrupted.byteLength - 5] = 0x7f;
      expect(() => parseFileIndex(corrupted)).toThrow(/Invalid backward size/);
    });

    it('should throw on invalid XZ index indicator', async () => {
      const compressed = await xzAsync('index indicator test');
      const corrupted = new Uint8Array(compressed);
      // The index indicator is at: fileSize - 12 - backwardSize
      // Read backward size from footer (little-endian u32 at offset -8)
      const footer = corrupted.subarray(corrupted.byteLength - 12);
      const backwardSize =
        ((footer[4] | (footer[5] << 8) | (footer[6] << 16) | (footer[7] << 24)) + 1) * 4;
      const indexStart = corrupted.byteLength - 12 - backwardSize;
      // Corrupt the index indicator byte (should be 0x00)
      corrupted[indexStart] = 0xff;
      expect(() => parseFileIndex(corrupted)).toThrow(/Invalid XZ index indicator/);
    });

    it('should throw on VLI with too many continuation bytes', () => {
      // Build fake XZ data with valid header, footer, and backward size
      // but a VLI in the index that has 10+ continuation bytes (all with high bit set)
      const compressed = new Uint8Array(36);
      // XZ magic header
      compressed.set([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
      // XZ footer at last 12 bytes: CRC32(4) + BackwardSize(4) + Flags(2) + 'YZ'(2)
      const footerStart = compressed.byteLength - 12;
      // Backward size = (0 + 1) * 4 = 4 → index is 4 bytes before footer
      compressed[footerStart + 4] = 0x00;
      compressed[footerStart + 5] = 0x00;
      compressed[footerStart + 6] = 0x00;
      compressed[footerStart + 7] = 0x00;
      // Footer flags
      compressed[footerStart + 8] = 0x00;
      compressed[footerStart + 9] = 0x00;
      // Footer magic 'YZ'
      compressed[footerStart + 10] = 0x59;
      compressed[footerStart + 11] = 0x5a;
      // Index section at footerStart - 4
      const indexStart = footerStart - 4;
      compressed[indexStart] = 0x00; // Valid index indicator
      // VLI with all continuation bytes (high bit set) — will exceed 9 bytes
      compressed[indexStart + 1] = 0x80;
      compressed[indexStart + 2] = 0x80;
      compressed[indexStart + 3] = 0x80;
      // Need more bytes for VLI overflow — extend the buffer
      // Actually the VLI reader will run past available bytes and throw "Truncated VLI"
      // Let's make a bigger buffer with 10+ continuation bytes
      const big = new Uint8Array(48);
      big.set([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]); // header
      const bFooterStart = big.byteLength - 12;
      // Backward size = (3 + 1) * 4 = 16 → index starts 16 bytes before footer
      big[bFooterStart + 4] = 0x03;
      big[bFooterStart + 5] = 0x00;
      big[bFooterStart + 6] = 0x00;
      big[bFooterStart + 7] = 0x00;
      big[bFooterStart + 8] = 0x00;
      big[bFooterStart + 9] = 0x00;
      big[bFooterStart + 10] = 0x59;
      big[bFooterStart + 11] = 0x5a;
      const bIndexStart = bFooterStart - 16;
      big[bIndexStart] = 0x00; // index indicator
      // Fill VLI record count with 10 continuation bytes (all have high bit set)
      for (let i = 1; i <= 10; i++) {
        big[bIndexStart + i] = 0x80;
      }
      expect(() => parseFileIndex(big)).toThrow(/too many bytes/);
    });
  });
});
