import { describe, expect, it } from 'vitest';
import * as lzma from '../../src/lzma.js';

describe('Native LZMA Error Handling (Simplified)', () => {
  describe('Constructor Validation', () => {
    it('should handle invalid preset values', () => {
      expect(() => {
        new lzma.Xz({ preset: 10 }); // > 9 should fail
      }).toThrow();

      expect(() => {
        new lzma.Xz({ preset: -1 }); // < 0 should fail
      }).toThrow();
    });

    it('should handle too many filters', () => {
      // LZMA_FILTERS_MAX is typically 4, so this should fail
      const tooManyFilters = [
        lzma.LZMA_FILTER_X86,
        lzma.LZMA_FILTER_POWERPC,
        lzma.LZMA_FILTER_IA64,
        lzma.LZMA_FILTER_ARM,
        lzma.LZMA_FILTER_ARMTHUMB,
      ];
      expect(() => {
        new lzma.Xz({ filters: tooManyFilters });
      }).toThrow();
    });
  });

  describe('Data Processing', () => {
    it('should handle empty buffer gracefully', () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = lzma.xzSync(emptyBuffer);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0); // XZ header is always present

      // Should decompress back to empty
      const decompressed = lzma.unxzSync(result);
      expect(decompressed.length).toBe(0);
    });

    it('should handle single byte buffer', () => {
      const singleByte = Buffer.from([0x42]);
      const result = lzma.xzSync(singleByte);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(1);

      const decompressed = lzma.unxzSync(result);
      expect(decompressed).toEqual(singleByte);
    });

    it('should handle various data patterns', () => {
      // Compressible data
      const compressibleData = Buffer.alloc(1000, 'A');
      const compressed = lzma.xzSync(compressibleData);
      expect(compressed.length).toBeLessThan(compressibleData.length);

      const decompressed = lzma.unxzSync(compressed);
      expect(decompressed).toEqual(compressibleData);
    });
  });

  describe('Error Conditions', () => {
    it('should handle invalid input types', () => {
      expect(() => {
        // @ts-expect-error - testing invalid input
        lzma.xzSync(123);
      }).toThrow();

      expect(() => {
        // @ts-expect-error - testing invalid input
        lzma.xzSync({});
      }).toThrow();
    });

    it('should handle corrupted data gracefully', async () => {
      const corruptedData = Buffer.from([0x01, 0x02, 0x03, 0x04]);

      // Async callback mode
      return new Promise<void>((resolve) => {
        lzma.unxz(corruptedData, (error, result) => {
          // Either error or empty result is acceptable
          if (error) {
            expect(error).toBeInstanceOf(Error);
          } else {
            expect(result).toBeInstanceOf(Buffer);
          }
          resolve();
        });
      });
    });
  });

  describe('Stream Operations', () => {
    it('should handle stream creation and cleanup', () => {
      const stream = new lzma.Xz();
      expect(stream).toBeDefined();

      // Should be able to close without error
      expect(() => stream.close()).not.toThrow();

      // Double close should not crash
      expect(() => stream.close()).not.toThrow();
    });

    it('should handle multiple stream instances', () => {
      const streams: lzma.Xz[] = [];

      // Create multiple streams
      for (let i = 0; i < 10; i++) {
        const stream = new lzma.Xz();
        streams.push(stream);
      }

      // Close all streams
      streams.forEach((stream) => {
        expect(() => stream.close()).not.toThrow();
      });
    });
  });

  describe('Threading and Performance', () => {
    it('should handle different thread counts', () => {
      const testData = Buffer.from('Threading test data'.repeat(100));

      // Test with different thread counts
      [1, 2, 4].forEach((threads) => {
        const result = lzma.xzSync(testData, { threads });
        expect(result).toBeInstanceOf(Buffer);

        const decompressed = lzma.unxzSync(result);
        expect(decompressed).toEqual(testData);
      });
    });

    it('should handle concurrent operations', async () => {
      const testData = Buffer.from('Concurrent test data');

      // Create multiple concurrent operations
      const promises = Array.from({ length: 5 }, (_, i) =>
        lzma.xzAsync(`${testData.toString()} ${i}`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result).toBeInstanceOf(Buffer);

        const decompressed = lzma.unxzSync(result);
        expect(decompressed.toString()).toBe(`${testData.toString()} ${i}`);
      });
    });
  });

  describe('Callback Behavior', () => {
    it('should provide correct callback signature for success', () => {
      const testData = Buffer.from('Callback test data');

      return new Promise<void>((resolve) => {
        lzma.xz(testData, (error, result) => {
          expect(error).toBeNull();
          expect(result).toBeInstanceOf(Buffer);
          expect(result?.length).toBeGreaterThan(0);
          resolve();
        });
      });
    });

    it('should handle nested callbacks', () => {
      const originalData = Buffer.from('Nested callback test');

      return new Promise<void>((resolve) => {
        lzma.xz(originalData, (error1, compressed) => {
          expect(error1).toBeNull();
          expect(compressed).toBeInstanceOf(Buffer);

          lzma.unxz(compressed as Buffer, (error2, decompressed) => {
            expect(error2).toBeNull();
            expect(decompressed).toEqual(originalData);
            resolve();
          });
        });
      });
    });

    it('should handle Promise-based operations', async () => {
      const testData = Buffer.from('Promise test data');

      const compressed = await lzma.xzAsync(testData);
      expect(compressed).toBeInstanceOf(Buffer);

      const decompressed = await lzma.unxzAsync(compressed);
      expect(decompressed).toEqual(testData);
    });
  });
});
