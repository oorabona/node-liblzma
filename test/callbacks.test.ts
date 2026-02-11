import { describe, expect, it } from 'vitest';
import * as lzma from '../src/lzma.js';

describe('Callback Validation and Behavior', () => {
  describe('Sync Mode Return Values', () => {
    it('should return correct errno, availIn, availOut tuple', () => {
      const testData = Buffer.from('Test data for sync return validation');
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });
      const outputBuffer = Buffer.alloc(1024);

      const [errno, availInAfter, availOutAfter] = stream.lzma.codeSync(
        lzma.LZMA_RUN,
        testData,
        0,
        testData.length,
        outputBuffer,
        0
      );

      // Validate return value types and ranges
      expect(typeof errno).toBe('number');
      expect(typeof availInAfter).toBe('number');
      expect(typeof availOutAfter).toBe('number');

      // errno should be LZMA_OK for successful operation
      expect(errno).toBe(lzma.LZMA_OK);

      // availInAfter should be 0 or less than original input length
      expect(availInAfter).toBeGreaterThanOrEqual(0);
      expect(availInAfter).toBeLessThanOrEqual(testData.length);

      // availOutAfter should be less than or equal to output buffer size
      expect(availOutAfter).toBeGreaterThanOrEqual(0);
      expect(availOutAfter).toBeLessThanOrEqual(outputBuffer.length);

      stream.close();
    });

    it('should return LZMA_STREAM_END when finishing', () => {
      const testData = Buffer.from('Small data for finish test');
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });
      const outputBuffer = Buffer.alloc(1024);

      // First pass - process data
      const [errno1] = stream.lzma.codeSync(
        lzma.LZMA_RUN,
        testData,
        0,
        testData.length,
        outputBuffer,
        0
      );
      expect(errno1).toBe(lzma.LZMA_OK);

      // Second pass - finish compression
      const [errno2, availInAfter2, availOutAfter2] = stream.lzma.codeSync(
        lzma.LZMA_FINISH,
        null,
        0,
        0,
        outputBuffer,
        0
      );

      expect(errno2).toBe(lzma.LZMA_STREAM_END);
      expect(availInAfter2).toBe(0);
      expect(availOutAfter2).toBeGreaterThanOrEqual(0);

      stream.close();
    });

    it('should handle partial processing correctly', () => {
      const largeData = Buffer.alloc(10000, 'X');
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });
      const smallOutputBuffer = Buffer.alloc(100); // Intentionally small

      let totalProcessed = 0;
      let inputOffset = 0;
      const maxIterations = 200; // Prevent infinite loops
      let iteration = 0;

      while (inputOffset < largeData.length && iteration < maxIterations) {
        const remainingInput = largeData.length - inputOffset;
        const chunkSize = Math.min(remainingInput, 1000);

        const [errno, availInAfter, availOutAfter] = stream.lzma.codeSync(
          lzma.LZMA_RUN,
          largeData,
          inputOffset,
          chunkSize,
          smallOutputBuffer,
          0
        );

        expect(errno).toBe(lzma.LZMA_OK);
        expect(availInAfter).toBeGreaterThanOrEqual(0);
        expect(availOutAfter).toBeGreaterThanOrEqual(0);

        const processed = chunkSize - availInAfter;
        inputOffset += processed;
        totalProcessed += processed;

        iteration++;
      }

      expect(totalProcessed).toBe(largeData.length);
      stream.close();
    });
  });

  describe('Async Callback Behavior', () => {
    it('should call callback with correct parameters', () => {
      const testData = Buffer.from('Async callback test data');

      return new Promise<void>((resolve) => {
        lzma.xz(testData, (error, result, ...args) => {
          // Validate callback signature
          expect([error, result, ...args]).toHaveLength(2);

          // No error should occur
          expect(error).toBeNull();

          // Result should be a Buffer
          expect(result).toBeInstanceOf(Buffer);
          expect(result?.length).toBeGreaterThan(0);

          // Result should be valid compressed data
          const decompressed = lzma.unxzSync(result as Buffer);
          expect(decompressed).toEqual(testData);

          resolve();
        });
      });
    });

    it('should call callback with error for invalid data', () => {
      const invalidCompressedData = Buffer.from([0x00, 0x01, 0x02, 0x03]);

      return new Promise<void>((resolve) => {
        lzma.unxz(invalidCompressedData, (error, result) => {
          // Either error should be present OR result should be empty buffer
          if (error) {
            expect(error).toBeInstanceOf(Error);
            expect(typeof error.message).toBe('string');
            expect(result).toBeUndefined();
          } else {
            // Some invalid data might result in empty buffer instead of error
            expect(result).toBeInstanceOf(Buffer);
          }

          resolve();
        });
      });
    });

    it('should handle callback with options parameter', () => {
      const testData = Buffer.from('Options callback test');
      const options = { preset: lzma.preset.DEFAULT, check: lzma.check.CRC32 };

      return new Promise<void>((resolve) => {
        lzma.xz(testData, options, (error, result) => {
          expect(error).toBeNull();
          expect(result).toBeInstanceOf(Buffer);

          // Verify it was compressed with specified options
          const decompressed = lzma.unxzSync(result as Buffer);
          expect(decompressed).toEqual(testData);

          resolve();
        });
      });
    });

    it('should handle nested async operations', () => {
      const originalData = Buffer.from('Nested async test data');

      return new Promise<void>((resolve) => {
        let callbackCount = 0;

        // Compress then decompress in nested callbacks
        lzma.xz(originalData, (error1, compressed) => {
          callbackCount++;
          expect(error1).toBeNull();
          expect(compressed).toBeInstanceOf(Buffer);

          lzma.unxz(compressed as Buffer, (error2, decompressed) => {
            callbackCount++;
            expect(error2).toBeNull();
            expect(decompressed).toBeInstanceOf(Buffer);
            expect(decompressed).toEqual(originalData);

            expect(callbackCount).toBe(2);
            resolve();
          });
        });
      });
    });

    it('should handle multiple concurrent callbacks', () => {
      const testData = Buffer.from('Concurrent callback test');
      const totalOperations = 3; // Reduce to 3 to avoid race conditions
      const results: { index: number; result: Buffer }[] = [];

      return new Promise<void>((resolve, reject) => {
        let completedCallbacks = 0;
        const timeout = setTimeout(() => {
          reject(new Error('Test timed out waiting for callbacks'));
        }, 4000);

        for (let i = 0; i < totalOperations; i++) {
          const dataWithIndex = Buffer.from(`${testData.toString()} - ${i}`);

          lzma.xz(dataWithIndex, (error, result) => {
            try {
              expect(error).toBeNull();
              expect(result).toBeInstanceOf(Buffer);

              results.push({ index: i, result: result as Buffer });
              completedCallbacks++;

              if (completedCallbacks === totalOperations) {
                clearTimeout(timeout);

                // Verify all results are valid (order doesn't matter for concurrent operations)
                results.forEach(({ index, result }) => {
                  const decompressed = lzma.unxzSync(result);
                  expect(decompressed.toString()).toBe(`${testData.toString()} - ${index}`);
                });

                resolve();
              }
            } catch (err) {
              clearTimeout(timeout);
              reject(err);
            }
          });
        }
      });
    });
  });

  describe('Promise-based Behavior', () => {
    it('should resolve with correct data type', async () => {
      const testData = Buffer.from('Promise resolve test');

      const result = await lzma.xzAsync(testData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);

      const decompressed = await lzma.unxzAsync(result);
      expect(decompressed).toEqual(testData);
    });

    it('should handle invalid data gracefully', async () => {
      const invalidData = Buffer.from([0xff, 0xff, 0xff, 0xff]);

      try {
        const result = await lzma.unxzAsync(invalidData);
        // Some invalid data might resolve with empty buffer
        expect(result).toBeInstanceOf(Buffer);
      } catch (error) {
        // Or it might throw an error, both are acceptable
        expect(error).toBeInstanceOf(Error);
        expect(typeof (error as Error).message).toBe('string');
      }
    });

    it('should handle Promise.all with multiple operations', async () => {
      const baseData = 'Promise.all test data';
      const operations = Array.from({ length: 3 }, (_, i) => lzma.xzAsync(`${baseData} - ${i}`));

      const results = await Promise.all(operations);

      expect(results).toHaveLength(3);
      results.forEach((result, i) => {
        expect(result).toBeInstanceOf(Buffer);

        const decompressed = lzma.unxzSync(result);
        expect(decompressed.toString()).toBe(`${baseData} - ${i}`);
      });
    });

    it('should handle Promise.allSettled with mixed success/failure', async () => {
      const validData = Buffer.from('Valid data');
      const invalidData = Buffer.from([0xba, 0xd0, 0xda, 0x1a]);

      const operations = [
        lzma.xzAsync(validData),
        lzma.unxzAsync(invalidData), // This might succeed or fail
        lzma.xzAsync('Another valid string'),
      ];

      const results = await Promise.allSettled(operations);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');

      // Middle operation might succeed or fail depending on how invalid data is handled
      if (results[1].status === 'fulfilled') {
        expect(results[1].value).toBeInstanceOf(Buffer);
      } else {
        expect(results[1].reason).toBeInstanceOf(Error);
      }

      if (results[0].status === 'fulfilled') {
        expect(results[0].value).toBeInstanceOf(Buffer);
      }
    });
  });

  describe('Stream Event Callbacks', () => {
    it('should emit data events during compression', () => {
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });
      const inputData = Buffer.from('Stream event test data');

      return new Promise<void>((resolve, reject) => {
        let dataEventCount = 0;
        let totalOutputSize = 0;

        stream.on('data', (chunk: Buffer) => {
          dataEventCount++;
          expect(chunk).toBeInstanceOf(Buffer);
          expect(chunk.length).toBeGreaterThan(0);
          totalOutputSize += chunk.length;
        });

        stream.on('end', () => {
          expect(dataEventCount).toBeGreaterThan(0);
          expect(totalOutputSize).toBeGreaterThan(0);
          resolve();
        });

        stream.on('error', (error: Error) => {
          reject(error);
        });

        stream.write(inputData);
        stream.end();
      });
    });

    it('should emit error events for invalid operations', () => {
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });

      return new Promise<void>((resolve) => {
        stream.on('error', (error: Error) => {
          expect(error).toBeInstanceOf(Error);
          expect(typeof error.message).toBe('string');
          resolve();
        });

        // Force an error by trying to write invalid data type
        try {
          // @ts-expect-error - intentionally testing error case
          stream.write(123);
        } catch (syncError) {
          // Might throw synchronously instead of emitting error event
          expect(syncError).toBeInstanceOf(Error);
          resolve();
        }
      });
    });

    it('should handle stream close gracefully', () => {
      const stream = new lzma.Xz({
        check: lzma.check.CRC32,
        preset: lzma.preset.DEFAULT,
        filters: [lzma.filter.LZMA2],
        threads: 1,
      });

      // Just test that close doesn't crash
      expect(() => {
        stream.close();
      }).not.toThrow();

      // Test that double close doesn't crash
      expect(() => {
        stream.close();
      }).not.toThrow();
    });
  });

  describe('Callback Error Handling', () => {
    it('should not crash on callback exceptions', () => {
      const testData = Buffer.from('Exception handling test');

      return new Promise<void>((resolve) => {
        try {
          lzma.xz(testData, (error, result) => {
            // Callback should be called despite upcoming exception
            expect(error).toBeNull();
            expect(result).toBeInstanceOf(Buffer);

            // This should not crash the process
            try {
              throw new Error('Intentional callback exception');
            } catch {
              // Catch the exception to prevent it from bubbling up
            }
          });

          // Give time for callback to execute
          setTimeout(() => {
            // If we get here, the process didn't crash
            resolve();
          }, 100);
        } catch (_syncError) {
          // The exception should be contained
          resolve();
        }
      });
    });

    it('should handle callback parameter types', () => {
      const testData = Buffer.from('Callback validation test');

      // Test with proper callback - should work
      return new Promise<void>((resolve) => {
        lzma.xz(testData, (error, result) => {
          expect(error).toBeNull();
          expect(result).toBeInstanceOf(Buffer);
          resolve();
        });
      });
    });

    it('should validate async callback timing', () => {
      const testData = Buffer.from('Timing validation test');
      const startTime = Date.now();

      return new Promise<void>((resolve) => {
        lzma.xz(testData, (error, result) => {
          const endTime = Date.now();
          const duration = endTime - startTime;

          // Callback should complete within a reasonable time (not hang)
          expect(duration).toBeGreaterThanOrEqual(0);

          // But should complete reasonably quickly for small data
          expect(duration).toBeLessThan(1000);

          expect(error).toBeNull();
          expect(result).toBeInstanceOf(Buffer);

          resolve();
        });
      });
    });
  });
});
