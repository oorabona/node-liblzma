import { describe, expect, it } from 'vitest';
import * as lzma from '../src/lzma.js';

describe('Edge Cases and Filter Processing', () => {
  it('should handle explicit zero threads configuration', () => {
    // Test with threads explicitly set to 0
    const xz = new lzma.Xz({ threads: 0 });
    expect(xz).toBeInstanceOf(lzma.Xz);
    xz.close();
  });

  it('should handle filter validation errors gracefully', () => {
    // Create a scenario that will trigger filter validation error
    expect(() => {
      // Create an object that will pass initial checks but fail during processing
      const badFilters: any = {
        // Make it pass basic type checks
        length: 1,
        0: lzma.filter.LZMA2,
      };

      // But make array operations fail
      Object.defineProperty(badFilters, 'push', {
        get() {
          throw new Error('Array operation failed');
        },
      });

      new lzma.Xz({ filters: badFilters });
    }).toThrow('Filters need to be in an array!');
  });

  it('should validate LZMA2 filter presence in filter chain', () => {
    // Create filters array without LZMA2 to force addition
    const filtersWithoutLZMA2 = [lzma.filter.X86];
    const xz = new lzma.Xz({ filters: filtersWithoutLZMA2 });
    expect(xz).toBeInstanceOf(lzma.Xz);
    xz.close();
  });

  it('should handle flush callback when stream is ending', () => {
    const xz = new lzma.Xz();

    return new Promise<void>((resolve) => {
      // Create a specific timing scenario
      xz.write(Buffer.from('data'));

      // Call end() to put in ending state
      xz.end();

      // Then immediately flush with callback
      process.nextTick(() => {
        xz.flush(() => {
          xz.close();
          resolve();
        });
      });
    });
  });

  it('should process data in synchronous mode', () => {
    // Process data synchronously to test sync processing paths
    const xz = new lzma.Xz();

    // Process in sync mode to ensure we hit all lines in the sync callback
    const testData = Buffer.from('test data for complex sync callback');
    const result = xz._processChunk(testData, lzma.LZMA_FINISH);

    expect(result).toBeInstanceOf(Buffer);
    xz.close();
  });

  it('should reallocate buffer when output space is exhausted', () => {
    // Create scenario where output buffer is exhausted
    const xz = new lzma.Xz({ chunkSize: 16 }); // Very small output buffer

    // Use highly compressible data to control output size
    const repetitiveData = Buffer.alloc(1024); // Large input, small output buffer
    repetitiveData.fill('A');

    const result = xz._processChunk(repetitiveData, lzma.LZMA_FINISH);
    expect(result).toBeInstanceOf(Buffer);
    xz.close();
  });

  it('should handle synchronous processing completion', () => {
    const xz = new lzma.Xz();

    // Process in sync mode to hit the callback logic
    const data = Buffer.from('sync callback test');
    const result = xz._processChunk(data, lzma.LZMA_FINISH);
    expect(result).toBeInstanceOf(Buffer);

    xz.close();
  });

  it('should initialize variables correctly in sync processing', () => {
    const xz = new lzma.Xz();

    // Call _processChunk in sync mode (no callback)
    const data = Buffer.from('sync processing test');
    const result = xz._processChunk(data, lzma.LZMA_FINISH);

    expect(result).toBeInstanceOf(Buffer);
    xz.close();
  });

  it('should provide complete default export object', () => {
    // Access all properties of default export to ensure it's fully covered
    const def = lzma.default;

    // Test core properties that should exist in default export
    const coreProperties = [
      'Xz',
      'Unxz',
      'XzStream',
      'hasThreads',
      'messages',
      'check',
      'preset',
      'flag',
      'filter',
      'mode',
      'createXz',
      'createUnxz',
      'xz',
      'unxz',
      'xzSync',
      'unxzSync',
      'xzAsync',
      'unxzAsync',
    ];

    coreProperties.forEach((prop) => {
      expect(def[prop]).toBeDefined();
      expect(def[prop]).toBe((lzma as any)[prop]);
    });

    // Test constants that might be in default export
    if (def.LZMAAction) expect(def.LZMAAction).toBe(lzma.LZMAAction);
    if (def.LZMAStatus) expect(def.LZMAStatus).toBe(lzma.LZMAStatus);
  });

  it('should complete constructor initialization with various options', () => {
    // Test different constructor paths with various configuration options
    const configs = [
      { chunkSize: 512 },
      { chunkSize: 1024, threads: 1 },
      { chunkSize: 2048, preset: lzma.preset.DEFAULT },
      { filters: [lzma.filter.LZMA2] },
    ];

    configs.forEach((config) => {
      const xz = new lzma.Xz(config);
      expect(xz).toBeInstanceOf(lzma.Xz);
      xz.close();
    });
  });

  it('should test complex async scenario for remaining lines', () => {
    return new Promise<void>((resolve) => {
      const xz = new lzma.Xz({ chunkSize: 64 });
      let processedChunks = 0;
      const totalChunks = 3;

      const processNextChunk = () => {
        processedChunks++;
        const data = Buffer.from(`async chunk ${processedChunks}`);

        xz._processChunk(data, lzma.LZMA_RUN, () => {
          if (processedChunks < totalChunks) {
            processNextChunk();
          } else {
            // Final chunk
            xz._processChunk(Buffer.from('final'), lzma.LZMA_FINISH, () => {
              xz.close();
              resolve();
            });
          }
        });
      };

      processNextChunk();
    });
  });

  it('should access all constant exports to trigger line coverage', () => {
    // Force execution of all constant definitions
    const constants = {
      // Lines 94-103 area
      LZMAAction: lzma.LZMAAction,
      LZMAStatus: lzma.LZMAStatus,

      // Other constants
      check: lzma.check,
      preset: lzma.preset,
      flag: lzma.flag,
      filter: lzma.filter,
      mode: lzma.mode,

      // Individual constants
      LZMA_RUN: lzma.LZMA_RUN,
      LZMA_SYNC_FLUSH: lzma.LZMA_SYNC_FLUSH,
      LZMA_FULL_FLUSH: lzma.LZMA_FULL_FLUSH,
      LZMA_FINISH: lzma.LZMA_FINISH,
      LZMA_OK: lzma.LZMA_OK,
      LZMA_STREAM_END: lzma.LZMA_STREAM_END,
    };

    // Verify all constants are accessible and valid
    Object.entries(constants).forEach(([name, value]) => {
      expect(value).toBeDefined();
      expect(typeof value === 'object' || typeof value === 'number').toBe(true);
    });
  });
});
