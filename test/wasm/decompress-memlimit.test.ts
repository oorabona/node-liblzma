/**
 * Tests for memlimit option wired through unxzAsync / unxz (WASM).
 *
 * Observable Success criteria:
 * - Very small memlimit (1024 bytes) causes LZMAMemoryLimitError (code === 'LZMA_MEMLIMIT_ERROR')
 * - Sufficient memlimit (256 MiB) allows decompression to succeed
 * - Both number and bigint forms of memlimit are accepted
 * - Callback variant (unxz) inherits the same behaviour
 * - Invalid memlimit values (NaN, Infinity, fractional, negative) throw LZMAOptionsError
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LZMA_MEMLIMIT_ERROR, LZMAMemoryLimitError, LZMAOptionsError } from '../../src/errors.js';
import { xzAsync } from '../../src/wasm/compress.js';
import { unxz, unxzAsync } from '../../src/wasm/decompress.js';
import { loadWasmModule, unloadWasmModule } from './wasm-helpers.utils.js';

/**
 * Build a fixture compressed at preset 6 (default dictionary = 8 MiB decoder requirement).
 * Preset 9 cannot be used in WASM because the encoder itself exceeds the WASM memory budget.
 * The decoder for preset-6 streams needs ~8 MiB; memlimit: 1024 (1 KiB) is well below ANY
 * realistic dictionary size, so it reliably triggers LZMA_MEMLIMIT_ERROR from
 * lzma_stream_buffer_decode regardless of the exact stream content.
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
    // Note: this test proves no-throw with the default, NOT that the default is specifically
    // 256 MiB. A truly exhaustive proof would require a fixture larger than 256 MiB
    // (impractical in a unit test). The 256 MiB default is enforced by DEFAULT_MEMLIMIT
    // in src/wasm/bindings.ts.
    const decompressed = await unxzAsync(compressed);
    expect(decompressed).toEqual(original);
  });

  // F-001: Validate memlimit before BigInt coercion — BigInt(NaN/Infinity/1.5) would throw
  // a native RangeError; negative integers silently wrap to huge uint64_t values.
  // All these must throw LZMAOptionsError (an LZMAError subclass), not a raw RangeError.
  describe('invalid memlimit values — throw LZMAOptionsError', () => {
    it('rejects NaN memlimit with LZMAOptionsError', async () => {
      const { compressed } = await makeFixture();
      await expect(unxzAsync(compressed, { memlimit: Number.NaN })).rejects.toThrow(
        LZMAOptionsError
      );
    });

    it('rejects Infinity memlimit with LZMAOptionsError', async () => {
      const { compressed } = await makeFixture();
      await expect(unxzAsync(compressed, { memlimit: Number.POSITIVE_INFINITY })).rejects.toThrow(
        LZMAOptionsError
      );
    });

    it('rejects fractional memlimit with LZMAOptionsError', async () => {
      const { compressed } = await makeFixture();
      await expect(unxzAsync(compressed, { memlimit: 1.5 })).rejects.toThrow(LZMAOptionsError);
    });

    it('rejects negative memlimit with LZMAOptionsError', async () => {
      const { compressed } = await makeFixture();
      await expect(unxzAsync(compressed, { memlimit: -1024 })).rejects.toThrow(LZMAOptionsError);
    });
  });

  describe('callback variant (unxz)', () => {
    it('passes LZMAMemoryLimitError to callback when memlimit too small', async () => {
      // C-001: await the fixture directly so rejection bubbles to vitest instead of hanging.
      const { compressed } = await makeFixture();
      await new Promise<void>((resolve, reject) => {
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
    });

    it('succeeds via callback with sufficient memlimit', async () => {
      // C-002: await fixture before constructing the callback promise.
      // C-003: assert byte-level equality, not just defined-ness.
      const { original, compressed } = await makeFixture();
      await new Promise<void>((resolve, reject) => {
        unxz(compressed, { memlimit: 256 * 1024 * 1024 }, (err, result) => {
          try {
            expect(err).toBeNull();
            expect(result).toBeDefined();
            // Verify decompressed bytes equal the original, not merely that something was returned.
            expect(Array.from(result!)).toEqual(Array.from(original));
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  });
});
