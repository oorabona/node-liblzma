/**
 * Block 3 Tests — Buffer API (compression)
 * Tests: SC-01, SC-03
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { xz, xzAsync, xzSync } from '../../src/wasm/compress.js';
import { unxzAsync } from '../../src/wasm/decompress.js';
import { loadWasmModule, unloadWasmModule } from './wasm-helpers.utils.js';

describe('WASM Compress (Block 3)', () => {
  beforeAll(async () => {
    await loadWasmModule();
  });

  afterAll(() => {
    unloadWasmModule();
  });

  describe('xzAsync', () => {
    it('SC-01: should compress a buffer and produce valid XZ', async () => {
      const input = new TextEncoder().encode('Hello, WASM World!');
      const compressed = await xzAsync(input);
      // XZ magic
      expect(compressed[0]).toBe(0xfd);
      expect(compressed[1]).toBe(0x37);
      // Round-trip
      const decompressed = await unxzAsync(compressed);
      expect(decompressed).toEqual(input);
    });

    it('should accept string input', async () => {
      const compressed = await xzAsync('String input test');
      const decompressed = await unxzAsync(compressed);
      expect(new TextDecoder().decode(decompressed)).toBe('String input test');
    });

    it('should accept ArrayBuffer input', async () => {
      const data = new TextEncoder().encode('ArrayBuffer test');
      const compressed = await xzAsync(data.buffer);
      const decompressed = await unxzAsync(compressed);
      expect(new TextDecoder().decode(decompressed)).toBe('ArrayBuffer test');
    });

    it('SC-03: higher presets should produce smaller output', async () => {
      const input = new TextEncoder().encode('A'.repeat(10000));
      const c0 = await xzAsync(input, { preset: 0 });
      const c6 = await xzAsync(input, { preset: 6 });
      expect(c6.byteLength).toBeLessThanOrEqual(c0.byteLength);
    });

    it('should handle empty input', async () => {
      const compressed = await xzAsync(new Uint8Array(0));
      const decompressed = await unxzAsync(compressed);
      expect(decompressed.byteLength).toBe(0);
    });
  });

  describe('xz (callback)', () => {
    it('should compress via callback', () =>
      new Promise<void>((resolve, reject) => {
        const input = new TextEncoder().encode('Callback test');
        xz(input, (err, result) => {
          if (err) return reject(err);
          expect(result).toBeDefined();
          expect(result?.[0]).toBe(0xfd);
          resolve();
        });
      }));

    it('should accept opts + callback', () =>
      new Promise<void>((resolve, reject) => {
        xz('Test with opts', { preset: 3 }, (err, result) => {
          if (err) return reject(err);
          expect(result?.[0]).toBe(0xfd);
          resolve();
        });
      }));
  });

  describe('xzSync', () => {
    it('SC-10b: should throw in browser (WASM) environment', () => {
      expect(() => xzSync('test')).toThrow(/Sync operations not supported/);
    });
  });
});
