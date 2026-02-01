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

    it('should throw on non-XZ data', () => {
      expect(() => parseFileIndex(new Uint8Array([1, 2, 3, 4]))).toThrow(/Not a valid XZ file/);
    });

    it('should throw on too-small XZ data', () => {
      const magic = new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
      expect(() => parseFileIndex(magic)).toThrow(/too small/);
    });
  });
});
