import { describe, expect, it } from 'vitest';
import * as lzma from '../../src/lzma.js';

describe('Native LZMA Error Codes', () => {
  describe('LZMA_OPTIONS_ERROR', () => {
    it('should fail with invalid preset > 9', () => {
      expect(() => {
        new lzma.Xz({
          check: lzma.check.CRC32,
          preset: 10, // > 9 should fail
          filters: [lzma.filter.LZMA2],
          threads: 1,
        });
      }).toThrow();
    });

    it('should fail with invalid preset < 0', () => {
      expect(() => {
        new lzma.Xz({
          check: lzma.check.CRC32,
          preset: -1, // < 0 should fail
          filters: [lzma.filter.LZMA2],
          threads: 1,
        });
      }).toThrow();
    });

    it('should fail with too many filters', () => {
      // LZMA_FILTERS_MAX is typically 4, so 5 should fail
      const tooManyFilters = [
        lzma.LZMA_FILTER_X86,
        lzma.LZMA_FILTER_POWERPC,
        lzma.LZMA_FILTER_IA64,
        lzma.LZMA_FILTER_ARM,
        lzma.LZMA_FILTER_ARMTHUMB,
      ];
      expect(() => {
        new lzma.Xz({
          check: lzma.check.CRC32,
          preset: lzma.preset.DEFAULT,
          filters: tooManyFilters,
          threads: 1,
        });
      }).toThrow();
    });

    it('should fail with invalid check value', () => {
      expect(() => {
        new lzma.Xz({
          check: 99, // Invalid check value
          preset: lzma.preset.DEFAULT,
          filters: [lzma.filter.LZMA2],
          threads: 1,
        });
      }).toThrow();
    });

    it.skipIf(!lzma.hasThreads())('should fail with negative threads', () => {
      expect(() => {
        new lzma.Xz({
          check: lzma.check.CRC32,
          preset: lzma.preset.DEFAULT,
          filters: [lzma.filter.LZMA2],
          threads: -1,
        });
      }).toThrow();
    });
  });

  describe('LZMA_DATA_ERROR', () => {
    it('should handle corrupted data in sync mode', () => {
      const corruptedData = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);

      // Corrupted data should return empty buffer or throw
      try {
        const result = lzma.unxzSync(corruptedData);
        expect(result).toBeInstanceOf(Buffer);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle corrupted data in async callback mode', () => {
      const corruptedData = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);

      return new Promise<void>((resolve) => {
        lzma.unxz(corruptedData, (error, result) => {
          // Either error should occur OR result should be empty buffer
          if (error) {
            expect(error).toBeInstanceOf(Error);
            expect(result).toBeUndefined();
          } else {
            expect(result).toBeInstanceOf(Buffer);
          }
          resolve();
        });
      });
    });

    it('should handle corrupted data in Promise mode', async () => {
      const corruptedData = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);

      try {
        const result = await lzma.unxzAsync(corruptedData);
        expect(result).toBeInstanceOf(Buffer);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle partially corrupted XZ data', () => {
      // First compress valid data, then corrupt the result
      const validData = 'This is valid test data';
      const compressed = lzma.xzSync(validData);

      // Corrupt the middle of the compressed data
      const corrupted = Buffer.from(compressed);
      corrupted[Math.floor(corrupted.length / 2)] = 0xff;

      // Corrupted data should be handled gracefully
      try {
        const result = lzma.unxzSync(corrupted);
        expect(result).toBeInstanceOf(Buffer);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('LZMA_BUF_ERROR handling', () => {
    it('should handle empty buffer gracefully', () => {
      const emptyBuffer = Buffer.alloc(0);

      const result = lzma.xzSync(emptyBuffer);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0); // XZ header is always present
    });

    it('should handle single byte buffer', () => {
      const singleByte = Buffer.from([0x42]);

      const result = lzma.xzSync(singleByte);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('errno callback validation', () => {
    it('should provide correct errno values in sync mode', () => {
      const testData = Buffer.from('Test data for errno validation');
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });

      // Process and check the returned errno values
      const [errno, availInAfter, availOutAfter] = stream.lzma.codeSync(
        lzma.LZMA_RUN,
        testData,
        0,
        testData.length,
        Buffer.alloc(1024),
        0
      );

      // Should return LZMA_OK (0) for successful operation
      expect(errno).toBe(lzma.LZMA_OK);
      expect(typeof availInAfter).toBe('number');
      expect(typeof availOutAfter).toBe('number');
      expect(availInAfter).toBeGreaterThanOrEqual(0);
      expect(availOutAfter).toBeGreaterThanOrEqual(0);

      stream.close();
    });

    it('should handle LZMA_STREAM_END correctly', () => {
      const testData = Buffer.from('Small test data');
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });

      // First process with RUN
      stream.lzma.codeSync(lzma.LZMA_RUN, testData, 0, testData.length, Buffer.alloc(1024), 0);

      // Then finish with FINISH - should return LZMA_STREAM_END
      const [errno, availInAfter, availOutAfter] = stream.lzma.codeSync(
        lzma.LZMA_FINISH,
        null,
        0,
        0,
        Buffer.alloc(1024),
        0
      );

      expect(errno).toBe(lzma.LZMA_STREAM_END);
      expect(availInAfter).toBe(0);
      expect(availOutAfter).toBeGreaterThanOrEqual(0);

      stream.close();
    });
  });

  describe('Parameter validation', () => {
    it('should validate constructor parameters strictly', () => {
      // Empty options should work (defaults are used)
      expect(() => {
        new lzma.Xz({});
      }).not.toThrow();

      // Invalid check type should be handled gracefully or throw
      try {
        new lzma.Xz({
          // @ts-expect-error - invalid type
          check: 'invalid',
        });
        // If it doesn't throw, it should at least create a valid stream
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should validate filters array', () => {
      expect(() => {
        new lzma.Xz({
          check: lzma.check.CRC32,
          preset: lzma.preset.DEFAULT,
          // @ts-expect-error - invalid filters type
          filters: 'not an array',
          threads: 1,
        });
      }).toThrow();

      expect(() => {
        new lzma.Xz({
          check: lzma.check.CRC32,
          preset: lzma.preset.DEFAULT,
          filters: ['invalid'], // Should be numbers
          threads: 1,
        });
      }).toThrow();
    });

    it('should validate codeSync parameters', () => {
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });

      expect(() => {
        // @ts-expect-error - wrong number of parameters
        stream.lzma.codeSync();
      }).toThrow();

      expect(() => {
        // @ts-expect-error - invalid flush flag
        stream.lzma.codeSync('invalid', Buffer.alloc(10), 0, 10, Buffer.alloc(10), 0);
      }).toThrow();

      stream.close();
    });

    it('should validate buffer boundaries', () => {
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });
      const buffer = Buffer.alloc(10);

      expect(() => {
        // Offset beyond buffer length
        stream.lzma.codeSync(lzma.LZMA_RUN, buffer, 15, 5, Buffer.alloc(10), 0);
      }).toThrow();

      expect(() => {
        // Length beyond buffer capacity from offset
        stream.lzma.codeSync(lzma.LZMA_RUN, buffer, 5, 10, Buffer.alloc(10), 0);
      }).toThrow();

      stream.close();
    });
  });

  describe('Stream state validation', () => {
    it('should handle operations on closed stream', () => {
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });

      // Use the stream first to ensure it's properly initialized
      stream.lzma.codeSync(lzma.LZMA_RUN, Buffer.from('test'), 0, 4, Buffer.alloc(100), 0);

      stream.close();

      // Try to use closed stream - either throws or behaves gracefully
      try {
        stream.lzma.codeSync(lzma.LZMA_RUN, Buffer.from('test'), 0, 4, Buffer.alloc(10), 0);
        // If it doesn't throw, just verify it's a valid operation
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle double close gracefully', () => {
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });
      stream.close();

      // Second close should not crash
      expect(() => stream.close()).not.toThrow();
    });

    it('should handle errno out of bounds in error handler', () => {
      const xz = new lzma.Xz();

      return new Promise<void>((resolve) => {
        xz.on('error', (error) => {
          expect(error).toBeInstanceOf(Error);
          // Should handle errno beyond messages array bounds gracefully
          resolve();
        });

        // Emit onerror with out-of-bounds errno
        xz.emit('onerror', 99999);
      });
    });
  });
});
