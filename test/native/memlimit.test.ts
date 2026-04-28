/**
 * Tests for memlimit option wired through native Unxz / createUnxz streams.
 *
 * Observable Success criteria:
 * - Very small memlimit (1024 bytes) causes LZMAMemoryLimitError via stream 'error' event
 * - Sufficient memlimit (256 MiB, number) allows decompression to succeed
 * - Sufficient memlimit (256 MiB, bigint) allows decompression to succeed
 * - createUnxz factory variant inherits the same behaviour
 * - No memlimit (default UINT64_MAX) preserves current behavior (success)
 * - Invalid memlimit values (NaN, Infinity, fractional, negative) throw LZMAOptionsError
 *   synchronously in the constructor (JS-side validation guard)
 * - bigint above UINT64_MAX throws LZMAOptionsError
 * - Exactly UINT64_MAX bigint is accepted (no limit)
 */

import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { LZMA_MEMLIMIT_ERROR, LZMAMemoryLimitError, LZMAOptionsError } from '../../src/errors.js';
import { createUnxz, Unxz, Xz, xzAsync } from '../../src/lzma.js';

/** Compress a small payload at preset 6 to produce a fixture .xz buffer.
 *
 * A preset-6 stream requires ~8 MiB for the decoder; memlimit:1024 (1 KiB)
 * is well below any realistic dictionary size and reliably triggers
 * LZMA_MEMLIMIT_ERROR from lzma_code on the first decode call.
 */
async function makeFixture(): Promise<{ original: Buffer; compressed: Buffer }> {
  const original = Buffer.from(`native memlimit fixture: ${'x'.repeat(512)}`);
  const compressed = await xzAsync(original, { preset: 6 });
  return { original, compressed };
}

/** Decompress via a Node.js Transform stream and collect the output. */
function streamDecompress(compressed: Buffer, stream: Unxz): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);

    const src = Readable.from(compressed);
    src.pipe(stream);
  });
}

/** Expect the stream to emit an error (not end). Returns the error. */
function streamExpectError(compressed: Buffer, stream: Unxz): Promise<Error> {
  return new Promise((resolve, reject) => {
    stream.on('error', (e) => resolve(e as Error));
    stream.on('end', () =>
      reject(new Error('expected stream to emit error, but it ended cleanly'))
    );

    const src = Readable.from(compressed);
    src.pipe(stream);
  });
}

describe('Native Unxz — memlimit option', () => {
  it('emits LZMAMemoryLimitError when memlimit is too small (number: 1024)', async () => {
    const { compressed } = await makeFixture();
    const stream = new Unxz({ memlimit: 1024 });
    const err = await streamExpectError(compressed, stream);
    expect(err).toBeInstanceOf(LZMAMemoryLimitError);
    expect((err as LZMAMemoryLimitError).code).toBe(LZMA_MEMLIMIT_ERROR);
  });

  it('succeeds with sufficient memlimit (number: 256 MiB)', async () => {
    const { original, compressed } = await makeFixture();
    const stream = new Unxz({ memlimit: 256 * 1024 * 1024 });
    const result = await streamDecompress(compressed, stream);
    expect(result).toEqual(original);
  });

  it('succeeds with sufficient memlimit (bigint: 256 MiB)', async () => {
    const { original, compressed } = await makeFixture();
    const stream = new Unxz({ memlimit: BigInt(256 * 1024 * 1024) });
    const result = await streamDecompress(compressed, stream);
    expect(result).toEqual(original);
  });

  it('succeeds with no memlimit option (default UINT64_MAX — no limit)', async () => {
    const { original, compressed } = await makeFixture();
    const stream = new Unxz();
    const result = await streamDecompress(compressed, stream);
    expect(result).toEqual(original);
  });

  describe('createUnxz factory — same memlimit coverage', () => {
    it('emits LZMAMemoryLimitError when memlimit is too small (number: 1024)', async () => {
      const { compressed } = await makeFixture();
      const stream = createUnxz({ memlimit: 1024 });
      const err = await streamExpectError(compressed, stream);
      expect(err).toBeInstanceOf(LZMAMemoryLimitError);
      expect((err as LZMAMemoryLimitError).code).toBe(LZMA_MEMLIMIT_ERROR);
    });

    it('succeeds with sufficient memlimit (bigint: 256 MiB)', async () => {
      const { original, compressed } = await makeFixture();
      const stream = createUnxz({ memlimit: BigInt(256 * 1024 * 1024) });
      const result = await streamDecompress(compressed, stream);
      expect(result).toEqual(original);
    });
  });

  describe('JS-side validation — LZMAOptionsError thrown synchronously', () => {
    it('throws LZMAOptionsError for NaN memlimit', () => {
      expect(() => new Unxz({ memlimit: Number.NaN })).toThrow(LZMAOptionsError);
    });

    it('throws LZMAOptionsError for Infinity memlimit', () => {
      expect(() => new Unxz({ memlimit: Number.POSITIVE_INFINITY })).toThrow(LZMAOptionsError);
    });

    it('throws LZMAOptionsError for fractional memlimit', () => {
      expect(() => new Unxz({ memlimit: 1.5 })).toThrow(LZMAOptionsError);
    });

    it('throws LZMAOptionsError for negative number memlimit', () => {
      expect(() => new Unxz({ memlimit: -1024 })).toThrow(LZMAOptionsError);
    });

    it('throws LZMAOptionsError for negative bigint memlimit', () => {
      expect(() => new Unxz({ memlimit: -1n })).toThrow(LZMAOptionsError);
    });

    it('throws LZMAOptionsError for number above MAX_SAFE_INTEGER', () => {
      expect(() => new Unxz({ memlimit: 2 ** 53 })).toThrow(LZMAOptionsError);
    });
  });

  describe('bigint UINT64_MAX boundary', () => {
    it('accepts exactly UINT64_MAX bigint (no limit)', async () => {
      const { original, compressed } = await makeFixture();
      // 18446744073709551615n = 2n**64n - 1n — the maximum accepted value
      const stream = new Unxz({ memlimit: 18446744073709551615n });
      const result = await streamDecompress(compressed, stream);
      expect(result).toEqual(original);
    });

    it('throws LZMAOptionsError for bigint above UINT64_MAX', () => {
      // 18446744073709551616n = 2n**64n — one past UINT64_MAX, would truncate in C ABI
      expect(() => new Unxz({ memlimit: 18446744073709551616n })).toThrow(LZMAOptionsError);
    });
  });

  describe('Encoder (Xz) — memlimit is silently ignored', () => {
    it('does NOT throw when NaN memlimit is passed to Xz (encoder ignores memlimit)', () => {
      // The JS-side guard only fires for STREAM_DECODE. Encoder paths forward memlimit
      // into _opts for type uniformity but the C side ignores it entirely.
      // This test locks the contract: invalid memlimit values do NOT throw for encoders.
      expect(() => new Xz({ memlimit: Number.NaN })).not.toThrow();
    });
  });
});
