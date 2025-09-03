/**
 * Test suite to verify deep copying of LZMA options prevents parameter mutation
 */
import { describe, expect, it } from 'vitest';
import * as lzma from '../src/lzma.js';

describe('Deep Copy Options', () => {
  it('should not mutate input filters array in XzStream', () => {
    const originalFilters = [lzma.filter.LZMA2, lzma.filter.X86];
    const opts = {
      filters: originalFilters,
      preset: 6,
    };

    // Create stream - this should not mutate the original options
    const stream = new lzma.Xz(opts);

    // Original options should remain unchanged
    expect(opts.filters).toEqual([lzma.filter.LZMA2, lzma.filter.X86]);
    expect(opts.filters).toBe(originalFilters); // Same reference
    expect(opts.preset).toBe(6);

    stream.close();
  });

  it('should not mutate input options in synchronous functions', () => {
    const originalFilters = [lzma.filter.LZMA2];
    const opts = {
      filters: originalFilters,
      preset: 3,
      threads: 2,
    };

    const testData = Buffer.from('Hello, World!');

    // Compress data - should not mutate original options
    const compressed = lzma.xzSync(testData, opts);

    // Original options should remain unchanged
    expect(opts.filters).toBe(originalFilters);
    expect(opts.filters).toEqual([lzma.filter.LZMA2]);
    expect(opts.preset).toBe(3);
    expect(opts.threads).toBe(2);

    // Decompress to verify it worked
    const decompressed = lzma.unxzSync(compressed, opts);
    expect(decompressed.toString()).toBe('Hello, World!');

    // Options should still be unchanged
    expect(opts.filters).toBe(originalFilters);
    expect(opts.preset).toBe(3);
  });

  it('should not mutate input options in async functions', () => {
    return new Promise<void>((resolve, reject) => {
      const originalFilters = [lzma.filter.LZMA2];
      const opts = {
        filters: originalFilters,
        preset: 1,
      };

      const testData = Buffer.from('Async test data');

      lzma.xz(testData, opts, (error, compressed) => {
        try {
          expect(error).toBeNull();
          expect(compressed).toBeInstanceOf(Buffer);

          // Original options should remain unchanged
          expect(opts.filters).toBe(originalFilters);
          expect(opts.filters).toEqual([lzma.filter.LZMA2]);
          expect(opts.preset).toBe(1);

          // Test decompression also doesn't mutate
          if (compressed) {
            lzma.unxz(compressed, opts, (error2, decompressed) => {
              try {
                expect(error2).toBeNull();
                expect(decompressed?.toString()).toBe('Async test data');

                // Options should still be unchanged
                expect(opts.filters).toBe(originalFilters);
                expect(opts.preset).toBe(1);

                resolve();
              } catch (e) {
                reject(e);
              }
            });
          } else {
            reject(new Error('Compression failed'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('should not mutate input options in Promise-based functions', async () => {
    const originalFilters = [lzma.filter.LZMA2];
    const opts = {
      filters: originalFilters,
      preset: 2,
      threads: 1,
    };

    const testData = Buffer.from('Promise test data');

    // Compress using Promise API
    const compressed = await lzma.xzAsync(testData, opts);

    // Original options should remain unchanged
    expect(opts.filters).toBe(originalFilters);
    expect(opts.filters).toEqual([lzma.filter.LZMA2]);
    expect(opts.preset).toBe(2);
    expect(opts.threads).toBe(1);

    // Decompress using Promise API
    const decompressed = await lzma.unxzAsync(compressed, opts);
    expect(decompressed.toString()).toBe('Promise test data');

    // Options should still be unchanged
    expect(opts.filters).toBe(originalFilters);
    expect(opts.preset).toBe(2);
  });

  it('should handle undefined and null options gracefully', () => {
    const testData = Buffer.from('Test data');

    // These should not throw errors
    expect(() => lzma.xzSync(testData, undefined)).not.toThrow();
    expect(() => lzma.xzSync(testData, {})).not.toThrow();

    const compressed = lzma.xzSync(testData, {});
    const decompressed = lzma.unxzSync(compressed, {});
    expect(decompressed.toString()).toBe('Test data');
  });
});
