/**
 * Tests for memlimit option wired through unxzAsync / unxz (WASM).
 *
 * Observable Success criteria:
 * - Very small memlimit (1024 bytes) causes LZMAMemoryLimitError (code === 'LZMA_MEMLIMIT_ERROR')
 * - Sufficient memlimit (256 MiB) allows decompression to succeed
 * - Both number and bigint forms of memlimit are accepted
 * - Callback variant (unxz) inherits the same behaviour
 * - Invalid memlimit values (NaN, Infinity, fractional, negative) throw LZMAOptionsError
 * - Number above MAX_SAFE_INTEGER throws LZMAOptionsError (precision loss)
 * - decoderInit / autoDecoderInit validate memlimit at every entry point
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LZMA_MEMLIMIT_ERROR, LZMAMemoryLimitError, LZMAOptionsError } from '../../src/errors.js';
import { xzAsync } from '../../src/wasm/compress.js';
import { unxz, unxzAsync } from '../../src/wasm/decompress.js';
import { autoDecoderInit, decoderInit } from '../../src/wasm/bindings.js';
import type { WasmLzmaStream } from '../../src/wasm/memory.js';
import { loadWasmModule, unloadWasmModule } from './wasm-helpers.utils.js';

/**
 * Build a fixture compressed at preset 6 (default dictionary = 8 MiB decoder requirement).
 * Preset 9 cannot be used in WASM because the encoder itself exceeds the WASM memory budget.
 * The decoder for preset-6 streams needs ~8 MiB; memlimit: 1024 (1 KiB) is well below ANY
 * realistic dictionary size, so it reliably triggers LZMA_MEMLIMIT_ERROR from
 * lzma_stream_buffer_decode regardless of the exact stream content.
 */
async function makeFixture(): Promise<{ original: Uint8Array; compressed: Uint8Array }> {
  const original = new TextEncoder().encode(`memlimit fixture: ${'x'.repeat(512)}`);
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
            if (result === undefined) throw new Error('result is undefined — test setup failed');
            expect(Array.from(result)).toEqual(Array.from(original));
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  });

  // C-2-004: Number above MAX_SAFE_INTEGER loses precision on BigInt coercion.
  // Verify this is rejected with LZMAOptionsError, not silently passed through.
  describe('C-2-004 — number > MAX_SAFE_INTEGER rejected (precision loss)', () => {
    it('rejects number equal to 2**53 with LZMAOptionsError', async () => {
      const { compressed } = await makeFixture();
      // 2**53 === Number.MAX_SAFE_INTEGER + 1 — the first integer that cannot
      // be represented exactly; BigInt(2**53) may not equal 2n**53n.
      const tooLarge = 2 ** 53;
      await expect(unxzAsync(compressed, { memlimit: tooLarge })).rejects.toThrow(LZMAOptionsError);
    });

    it('rejects number well above MAX_SAFE_INTEGER (2**60) with LZMAOptionsError', async () => {
      const { compressed } = await makeFixture();
      await expect(unxzAsync(compressed, { memlimit: 2 ** 60 })).rejects.toThrow(LZMAOptionsError);
    });

    it('accepts bigint 2n**53n (same magnitude, no precision loss)', async () => {
      const { original, compressed } = await makeFixture();
      // bigint path bypasses the MAX_SAFE_INTEGER guard — no precision loss.
      const decompressed = await unxzAsync(compressed, { memlimit: 2n ** 53n });
      expect(decompressed).toEqual(original);
    });

    it('accepts Number.MAX_SAFE_INTEGER itself (exactly representable)', async () => {
      const { original, compressed } = await makeFixture();
      const decompressed = await unxzAsync(compressed, { memlimit: Number.MAX_SAFE_INTEGER });
      expect(decompressed).toEqual(original);
    });
  });

  // C-2-005: validateMemlimit must be called at every public memlimit entry point.
  // decoderInit and autoDecoderInit previously did raw BigInt(memlimit) without validation.
  describe('C-2-005 — decoderInit / autoDecoderInit validate memlimit', () => {
    // validateMemlimit runs before getModule(), so we can test with a null stream
    // cast — the throw happens before the stream is accessed.
    const nullStream = null as unknown as WasmLzmaStream;

    describe('decoderInit — invalid memlimit rejected', () => {
      it('rejects NaN memlimit', () => {
        expect(() => decoderInit(nullStream, Number.NaN)).toThrow(LZMAOptionsError);
      });

      it('rejects Infinity memlimit', () => {
        expect(() => decoderInit(nullStream, Infinity)).toThrow(LZMAOptionsError);
      });

      it('rejects fractional memlimit', () => {
        expect(() => decoderInit(nullStream, 1.5)).toThrow(LZMAOptionsError);
      });

      it('rejects negative memlimit', () => {
        expect(() => decoderInit(nullStream, -1)).toThrow(LZMAOptionsError);
      });

      it('rejects negative bigint memlimit', () => {
        expect(() => decoderInit(nullStream, -1n)).toThrow(LZMAOptionsError);
      });

      it('rejects number above MAX_SAFE_INTEGER', () => {
        expect(() => decoderInit(nullStream, 2 ** 53)).toThrow(LZMAOptionsError);
      });
    });

    describe('autoDecoderInit — invalid memlimit rejected', () => {
      it('rejects NaN memlimit', () => {
        expect(() => autoDecoderInit(nullStream, Number.NaN)).toThrow(LZMAOptionsError);
      });

      it('rejects Infinity memlimit', () => {
        expect(() => autoDecoderInit(nullStream, Infinity)).toThrow(LZMAOptionsError);
      });

      it('rejects fractional memlimit', () => {
        expect(() => autoDecoderInit(nullStream, 1.5)).toThrow(LZMAOptionsError);
      });

      it('rejects negative memlimit', () => {
        expect(() => autoDecoderInit(nullStream, -1)).toThrow(LZMAOptionsError);
      });

      it('rejects negative bigint memlimit', () => {
        expect(() => autoDecoderInit(nullStream, -1n)).toThrow(LZMAOptionsError);
      });

      it('rejects number above MAX_SAFE_INTEGER', () => {
        expect(() => autoDecoderInit(nullStream, 2 ** 53)).toThrow(LZMAOptionsError);
      });
    });
  });
});
