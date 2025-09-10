import { describe, expect, it } from 'vitest';
import * as lzma from '../src/lzma.js';

describe('Thread Support and Exports', () => {
  it('should cover hasThreads function (lines 521-522)', () => {
    const result = lzma.hasThreads();
    expect(typeof result).toBe('boolean');
    // The function should return true or false based on liblzma build
    expect(result === true || result === false).toBe(true);
  });

  it('should cover buffer reallocation logic (lines 404-405)', () => {
    // Force buffer reallocation by using small chunk size
    const xz = new lzma.Xz({ chunkSize: 32 });

    // Process data larger than chunk size to force multiple buffer operations
    const largeData = Buffer.alloc(256, 'a');
    const result = xz._processChunk(largeData, lzma.LZMA_FINISH);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    xz.close();
  });

  it('should cover all exported functions and constants', () => {
    // Test all major exports to ensure they're covered
    expect(lzma.Xz).toBeDefined();
    expect(lzma.Unxz).toBeDefined();
    expect(lzma.XzStream).toBeDefined();

    expect(lzma.check).toBeDefined();
    expect(lzma.preset).toBeDefined();
    expect(lzma.flag).toBeDefined();
    expect(lzma.filter).toBeDefined();
    expect(lzma.mode).toBeDefined();

    expect(lzma.LZMAAction).toBeDefined();
    expect(lzma.LZMAStatus).toBeDefined();
    expect(lzma.LZMAErrorMessage).toBeDefined();

    expect(lzma.createXz).toBeDefined();
    expect(lzma.createUnxz).toBeDefined();
    expect(lzma.hasThreads).toBeDefined();

    expect(lzma.xz).toBeDefined();
    expect(lzma.unxz).toBeDefined();
    expect(lzma.xzSync).toBeDefined();
    expect(lzma.unxzSync).toBeDefined();
    expect(lzma.xzAsync).toBeDefined();
    expect(lzma.unxzAsync).toBeDefined();

    // Test that messages array is exported
    expect(lzma.messages).toBeDefined();
    expect(Array.isArray(lzma.messages)).toBe(true);
  });

  it('should test comprehensive compression with buffer management', () => {
    const xz = new lzma.Xz({
      chunkSize: 64, // Small chunk to trigger buffer management
      preset: lzma.preset.DEFAULT,
    });

    // Test with data that will definitely trigger buffer reallocation
    const testData = Buffer.concat([
      Buffer.from('First chunk of data that will fill the buffer'),
      Buffer.from('Second chunk that should trigger reallocation'),
      Buffer.from('Third chunk to ensure multiple reallocations'),
    ]);

    const compressed = xz._processChunk(testData, lzma.LZMA_FINISH);
    expect(compressed).toBeInstanceOf(Buffer);
    expect(compressed.length).toBeGreaterThan(0);

    xz.close();
  });

  it('should test all constant values are accessible', () => {
    // Access all constant values to ensure they're covered
    const constants = [
      lzma.LZMA_RUN,
      lzma.LZMA_SYNC_FLUSH,
      lzma.LZMA_FULL_FLUSH,
      lzma.LZMA_FINISH,
      lzma.LZMA_OK,
      lzma.LZMA_STREAM_END,
      lzma.LZMA_NO_CHECK,
      lzma.LZMA_UNSUPPORTED_CHECK,
      lzma.LZMA_GET_CHECK,
      lzma.LZMA_MEM_ERROR,
      lzma.LZMA_MEMLIMIT_ERROR,
      lzma.LZMA_FORMAT_ERROR,
      lzma.LZMA_OPTIONS_ERROR,
      lzma.LZMA_DATA_ERROR,
      lzma.LZMA_BUF_ERROR,
      lzma.LZMA_PROG_ERROR,
    ];

    constants.forEach((constant) => {
      expect(typeof constant).toBe('number');
      expect(Number.isInteger(constant)).toBe(true);
    });
  });
});
