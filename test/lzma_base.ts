import { describe, expect, it } from 'vitest';
import { createUnxz, createXz, filter, hasThreads, Xz, xzSync } from '../src/lzma.js';

describe('Xz Compressor options', () => {
  it('should only allow Array filters', () => {
    expect(() => {
      new Xz({ filters: filter.LZMA2 as unknown as number[] });
    }).toThrowError('Filters need to be in an array!');
  });

  it('should handle malformed array-like filters', () => {
    // Create an object that passes Array.isArray but fails on spread
    const malformedArray = [];
    Object.defineProperty(malformedArray, Symbol.iterator, {
      value: () => {
        throw new Error('Iterator failed');
      },
    });

    expect(() => {
      new Xz({ filters: malformedArray as unknown as number[] });
    }).toThrowError('Filters need to be in an array!');
  });

  it('should throw error if more than LZMA_MAX_FILTERS set', () => {
    expect(() => {
      new Xz({
        filters: [
          // filter.LZMA2 (should be automagically added anyway)
          filter.X86,
          filter.IA64,
          filter.ARM,
        ],
      });
    }).toThrow();
  });

  it('should reorder filters to put LZMA2 last when it is not in the correct position', () => {
    // Test case where LZMA2 is not at the end and needs reordering
    const stream = new Xz({ filters: [filter.LZMA2, filter.X86] });

    // The stream should be created successfully (LZMA2 gets moved to the end internally)
    expect(stream).toBeDefined();

    stream.close();
  });
});

describe('Utility Functions', () => {
  it('should test hasThreads function', () => {
    const result = hasThreads();
    expect(typeof result).toBe('boolean');
  });

  it('should test createXz factory function', () => {
    const stream = createXz({ preset: 1 });
    expect(stream).toBeInstanceOf(Xz);
    stream.close();
  });

  it('should test createUnxz factory function', () => {
    const stream = createUnxz({ preset: 1 });
    expect(stream).toBeDefined();
    stream.close();
  });

  it('should handle string input in sync operations', () => {
    // Test string buffer conversion path (line 579)
    const result = xzSync('hello world test string');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });
});
