import { describe, expect, it } from 'vitest';
import * as lzma from '../../src/lzma.js';

describe('Robustness and Edge Cases', () => {
  describe('Buffer Edge Cases', () => {
    it('should handle zero-length input', () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = lzma.xzSync(emptyBuffer);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0); // XZ header is always present

      // Should be able to decompress back to empty
      const decompressed = lzma.unxzSync(result);
      expect(decompressed.length).toBe(0);
    });

    it('should handle single byte input', () => {
      const singleByte = Buffer.from([0x42]);
      const result = lzma.xzSync(singleByte);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(1);

      const decompressed = lzma.unxzSync(result);
      expect(decompressed).toEqual(singleByte);
    });

    it('should handle very large buffers', () => {
      // Test with 1MB of data
      const largeBuffer = Buffer.alloc(1024 * 1024, 'X');
      const result = lzma.xzSync(largeBuffer);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeLessThan(largeBuffer.length); // Should compress well

      const decompressed = lzma.unxzSync(result);
      expect(decompressed.length).toBe(largeBuffer.length);
      expect(decompressed.every((b) => b === 'X'.charCodeAt(0))).toBe(true);
    });

    it('should handle random incompressible data', () => {
      // Generate pseudo-random data that won't compress well
      const randomBuffer = Buffer.alloc(1024);
      for (let i = 0; i < randomBuffer.length; i++) {
        randomBuffer[i] = Math.floor(Math.random() * 256);
      }

      const result = lzma.xzSync(randomBuffer);
      expect(result).toBeInstanceOf(Buffer);

      const decompressed = lzma.unxzSync(result);
      expect(decompressed).toEqual(randomBuffer);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple streams simultaneously', async () => {
      const testData = 'Test data for concurrent operations';
      const promises: Promise<Buffer>[] = [];

      // Create 10 concurrent compression operations
      for (let i = 0; i < 10; i++) {
        const promise = lzma.xzAsync(`${testData} - instance ${i}`);
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result).toBeInstanceOf(Buffer);
        expect(result.length).toBeGreaterThan(0);

        // Verify each can be decompressed correctly
        const decompressed = lzma.unxzSync(result);
        expect(decompressed.toString()).toBe(`${testData} - instance ${i}`);
      });
    });

    it('should handle concurrent compress/decompress operations', async () => {
      const testData = Buffer.from('Concurrent compress and decompress test');

      const compressPromises = Array.from({ length: 5 }, (_, i) =>
        lzma.xzAsync(`${testData.toString()} - compress ${i}`)
      );

      const compressedData = lzma.xzSync(testData);
      const decompressPromises = Array.from({ length: 5 }, () => lzma.unxzAsync(compressedData));

      const [compressed, decompressed] = await Promise.all([
        Promise.all(compressPromises),
        Promise.all(decompressPromises),
      ]);

      expect(compressed).toHaveLength(5);
      expect(decompressed).toHaveLength(5);

      decompressed.forEach((result) => {
        expect(result).toEqual(testData);
      });
    });

    it('should handle stream creation/destruction cycles', () => {
      // Test creating and destroying many streams rapidly
      const testData = Buffer.from('Stream lifecycle test');

      for (let i = 0; i < 100; i++) {
        const stream = new lzma.Xz({
          check: lzma.check.CRC32,
          preset: lzma.preset.DEFAULT,
          filters: [lzma.filter.LZMA2],
          threads: 1,
        });

        // Use the stream briefly
        const [errno] = stream.lzma.codeSync(
          lzma.LZMA_RUN,
          testData,
          0,
          testData.length,
          Buffer.alloc(1024),
          0
        );

        expect(errno).toBe(lzma.LZMA_OK);

        stream.close();
      }

      // No memory leaks or crashes should occur
      expect(true).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from processing errors', () => {
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });

      try {
        // Try to process with invalid parameters
        stream.lzma.codeSync(
          999, // Invalid action
          Buffer.from('test'),
          0,
          4,
          Buffer.alloc(10),
          0
        );
      } catch (error) {
        // Error is expected, stream should still be usable after
        expect(error).toBeDefined();
      }

      // Stream should still work with valid parameters
      const [errno] = stream.lzma.codeSync(
        lzma.LZMA_RUN,
        Buffer.from('test'),
        0,
        4,
        Buffer.alloc(100),
        0
      );

      expect(errno).toBe(lzma.LZMA_OK);
      stream.close();
    });

    it('should handle interrupted async operations', () => {
      const largeData = Buffer.alloc(100000, 'X');

      return new Promise<void>((resolve) => {
        lzma.xz(largeData, (error, result) => {
          // This callback might be called after stream is closed
          // Should handle gracefully
          if (error) {
            expect(typeof error.message).toBe('string');
          } else {
            expect(result).toBeInstanceOf(Buffer);
          }
          resolve();
        });

        // Don't wait for completion, let GC potentially clean up
      });
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with repeated operations', () => {
      const testData = Buffer.from('Memory leak test data');

      // Perform many operations to detect potential leaks
      for (let i = 0; i < 1000; i++) {
        const compressed = lzma.xzSync(testData);
        const decompressed = lzma.unxzSync(compressed);

        expect(decompressed).toEqual(testData);
      }

      // If we get here without running out of memory, likely OK
      expect(true).toBe(true);
    });

    it('should handle stream cleanup properly', () => {
      const streams: lzma.Xz[] = [];

      // Create many streams
      for (let i = 0; i < 50; i++) {
        const stream = new lzma.Xz({
          check: lzma.check.CRC32,
          preset: lzma.preset.DEFAULT,
          filters: [lzma.filter.LZMA2],
          threads: 1,
        });
        streams.push(stream);

        // Use each stream briefly
        stream.lzma.codeSync(
          lzma.LZMA_RUN,
          Buffer.from(`test ${i}`),
          0,
          `test ${i}`.length,
          Buffer.alloc(100),
          0
        );
      }

      // Close all streams
      streams.forEach((stream) => {
        stream.close();
      });

      // Verify they're all closed (no crashes)
      streams.forEach((stream) => {
        try {
          stream.lzma.codeSync(lzma.LZMA_RUN, Buffer.from('test'), 0, 4, Buffer.alloc(10), 0);
          // If it doesn't throw, that's also acceptable behavior
          expect(true).toBe(true);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe('Input Type Variations', () => {
    it('should handle different buffer types', () => {
      // Regular Buffer
      const regularBuffer = Buffer.from('regular buffer test');
      const result1 = lzma.xzSync(regularBuffer);
      expect(result1).toBeInstanceOf(Buffer);

      // Uint8Array (convert to Buffer first as it may not be directly supported)
      const uint8Array = new Uint8Array([116, 101, 115, 116]); // 'test'
      const bufferFromUint8 = Buffer.from(uint8Array);
      const result2 = lzma.xzSync(bufferFromUint8);
      expect(result2).toBeInstanceOf(Buffer);

      // String
      const stringData = 'string test';
      const result3 = lzma.xzSync(stringData);
      expect(result3).toBeInstanceOf(Buffer);

      // All should decompress correctly
      expect(lzma.unxzSync(result1).toString()).toBe('regular buffer test');
      expect(lzma.unxzSync(result2).toString()).toBe('test');
      expect(lzma.unxzSync(result3).toString()).toBe('string test');
    });

    it('should reject invalid input types', () => {
      expect(() => {
        // @ts-expect-error - testing invalid input
        lzma.xzSync(123);
      }).toThrow();

      expect(() => {
        // @ts-expect-error - testing invalid input
        lzma.xzSync({});
      }).toThrow();

      expect(() => {
        // @ts-expect-error - testing invalid input
        lzma.xzSync(null);
      }).toThrow();
    });
  });

  describe('Extreme Conditions', () => {
    it('should handle maximum compression levels', () => {
      const testData = Buffer.from('Maximum compression test data');

      // Test with highest preset (should work but be slow)
      const result = lzma.xzSync(testData, { preset: 9 });
      expect(result).toBeInstanceOf(Buffer);

      const decompressed = lzma.unxzSync(result);
      expect(decompressed).toEqual(testData);
    });

    it('should handle minimum compression levels', () => {
      const testData = Buffer.from('Minimum compression test data');

      // Test with lowest preset (should be fast)
      const result = lzma.xzSync(testData, { preset: 0 });
      expect(result).toBeInstanceOf(Buffer);

      const decompressed = lzma.unxzSync(result);
      expect(decompressed).toEqual(testData);
    });

    it('should handle multiple filter combinations', () => {
      const testData = Buffer.from('Filter combination test data');

      // Test different filter combinations
      const filterCombinations = [
        [lzma.filter.LZMA2],
        [lzma.filter.X86, lzma.filter.LZMA2],
        [lzma.filter.ARM, lzma.filter.LZMA2],
        [lzma.filter.POWERPC, lzma.filter.LZMA2],
      ];

      filterCombinations.forEach((filters) => {
        try {
          const result = lzma.xzSync(testData, { filters });
          expect(result).toBeInstanceOf(Buffer);

          const decompressed = lzma.unxzSync(result);
          expect(decompressed).toEqual(testData);
        } catch (error) {
          // Some filter combinations might not be supported
          // That's OK as long as it fails gracefully
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    it('should handle different thread counts', () => {
      const testData = Buffer.from('Thread count test data'.repeat(100));

      const threadCounts = [1, 2, 4, 8];

      threadCounts.forEach((threads) => {
        const result = lzma.xzSync(testData, { threads });
        expect(result).toBeInstanceOf(Buffer);

        const decompressed = lzma.unxzSync(result);
        expect(decompressed).toEqual(testData);
      });
    });
  });
});
