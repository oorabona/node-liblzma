import { describe, expect, it } from 'vitest';
import { filter, Xz } from '../lib/lzma.js';

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
});
