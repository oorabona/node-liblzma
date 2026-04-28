/**
 * Tests for memlimit option wired through unxzAsync / unxz (WASM).
 *
 * Observable Success criteria:
 * - Very small memlimit (1024 bytes) causes LZMAMemoryLimitError (code === 'LZMA_MEMLIMIT_ERROR')
 * - Sufficient memlimit (256 MiB) allows decompression to succeed
 * - Both number and bigint forms of memlimit are accepted
 * - Callback variant (unxz) inherits the same behaviour
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LZMA_MEMLIMIT_ERROR, LZMAMemoryLimitError } from '../../src/errors.js';
import { xzAsync } from '../../src/wasm/compress.js';
import { unxz, unxzAsync } from '../../src/wasm/decompress.js';
import { loadWasmModule, unloadWasmModule } from './wasm-helpers.utils.js';

/**
 * Build a fixture compressed at preset 6 (default, ~4 MB decoder memory requirement).
 * Preset 9 cannot be used in WASM because the encoder itself exceeds the WASM memory budget.
 * The decoder for preset-6 streams needs ~4 MB; memlimit: 1024 (1 KiB) reliably triggers
 * LZMA_MEMLIMIT_ERROR from lzma_stream_buffer_decode.
 */
async function makeFixture(): Promise<{ original: Uint8Array; compressed: Uint8Array }> {
  const original = new TextEncoder().encode('memlimit fixture: ' + 'x'.repeat(512));
  const compressed = await xzAsync(original, { preset: 6 });
  return { original, compressed };
}

describe('WASM unxzAsync — memlimit option', () => {
  beforeAll(async () => {
    await loadWasmModule();
  });

  afterAll(() => {
    unloadWasmModule();
  });

  it('rejects with LZMAMemoryLimitError when memlimit is too small (number)', async () => {
    const { compressed } = await makeFixture();
    await expect(unxzAsync(compressed, { memlimit: 1024 })).rejects.toThrow(LZMAMemoryLimitError);
  });

  it('rejects with code LZMA_MEMLIMIT_ERROR when memlimit is too small', async () => {
    const { compressed } = await makeFixture();
    const err = await unxzAsync(compressed, { memlimit: 1024 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LZMAMemoryLimitError);
    expect((err as LZMAMemoryLimitError).code).toBe(LZMA_MEMLIMIT_ERROR);
  });

  it('rejects with LZMAMemoryLimitError when memlimit is too small (bigint)', async () => {
    const { compressed } = await makeFixture();
    await expect(unxzAsync(compressed, { memlimit: 1024n })).rejects.toThrow(LZMAMemoryLimitError);
  });

  it('succeeds with sufficient memlimit (number: 256 MiB)', async () => {
    const { original, compressed } = await makeFixture();
    const decompressed = await unxzAsync(compressed, { memlimit: 256 * 1024 * 1024 });
    expect(decompressed).toEqual(original);
  });

  it('succeeds with sufficient memlimit (bigint: 256 MiB)', async () => {
    const { original, compressed } = await makeFixture();
    const decompressed = await unxzAsync(compressed, {
      memlimit: BigInt(256 * 1024 * 1024),
    });
    expect(decompressed).toEqual(original);
  });

  it('succeeds with no memlimit (uses default 256 MiB)', async () => {
    const { original, compressed } = await makeFixture();
    const decompressed = await unxzAsync(compressed);
    expect(decompressed).toEqual(original);
  });

  describe('callback variant (unxz)', () => {
    it('passes LZMAMemoryLimitError to callback when memlimit too small', () =>
      new Promise<void>((resolve, reject) => {
        makeFixture().then(({ compressed }) => {
          unxz(compressed, { memlimit: 1024 }, (err) => {
            try {
              expect(err).toBeInstanceOf(LZMAMemoryLimitError);
              expect((err as LZMAMemoryLimitError).code).toBe(LZMA_MEMLIMIT_ERROR);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });
      }));

    it('succeeds via callback with sufficient memlimit', () =>
      new Promise<void>((resolve, reject) => {
        makeFixture().then(({ original, compressed }) => {
          unxz(compressed, { memlimit: 256 * 1024 * 1024 }, (err, result) => {
            try {
              expect(err).toBeNull();
              expect(result).toBeDefined();
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });
      }));
  });
});
