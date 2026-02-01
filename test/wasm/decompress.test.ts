/**
 * Block 3 Tests — Buffer API (decompression)
 * Tests: SC-02, SC-11
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { xzAsync } from '../../src/wasm/compress.js';
import { unxz, unxzAsync, unxzSync } from '../../src/wasm/decompress.js';
import { loadWasmModule, unloadWasmModule } from './wasm-helpers.utils.js';

describe('WASM Decompress (Block 3)', () => {
  beforeAll(async () => {
    await loadWasmModule();
  });

  afterAll(() => {
    unloadWasmModule();
  });

  describe('unxzAsync', () => {
    it('SC-02: should decompress and match original', async () => {
      const original = new TextEncoder().encode('Decompression round-trip test');
      const compressed = await xzAsync(original);
      const decompressed = await unxzAsync(compressed);
      expect(decompressed).toEqual(original);
    });

    it('should handle large data (100KB)', async () => {
      const input = new Uint8Array(100 * 1024);
      for (let i = 0; i < input.length; i++) input[i] = i % 256;
      const compressed = await xzAsync(input, { preset: 1 });
      const decompressed = await unxzAsync(compressed);
      expect(decompressed).toEqual(input);
    });

    it('SC-11: should throw on invalid XZ data', async () => {
      const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x05]);
      await expect(unxzAsync(garbage)).rejects.toThrow();
    });

    it('should throw on truncated XZ data', async () => {
      const compressed = await xzAsync('test data');
      const truncated = compressed.slice(0, compressed.byteLength - 4);
      await expect(unxzAsync(truncated)).rejects.toThrow();
    });
  });

  describe('unxz (callback)', () => {
    it('should decompress via callback', async () => {
      const compressed = await xzAsync('Callback decompress test');
      await new Promise<void>((resolve, reject) => {
        unxz(compressed, (err, result) => {
          if (err || !result) return reject(err ?? new Error('No result'));
          expect(new TextDecoder().decode(result)).toBe('Callback decompress test');
          resolve();
        });
      });
    });
  });

  describe('unxzSync', () => {
    it('SC-10b: should throw in browser (WASM) environment', () => {
      expect(() => unxzSync(new Uint8Array(0))).toThrow(/Sync operations not supported/);
    });
  });
});
