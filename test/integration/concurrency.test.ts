/**
 * Concurrency and parallelism tests
 */

import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createUnxz, createXz, unxz, unxzAsync, xz, xzAsync } from '../../src/lzma.js';

describe('Concurrency Tests', () => {
  const testData = Buffer.from('Test data for concurrency '.repeat(100));

  describe('Parallel async operations', () => {
    it('should handle multiple concurrent xzAsync calls', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        xzAsync(Buffer.from(`Test data ${i} `.repeat(50)))
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
      });
    });

    it('should handle multiple concurrent unxzAsync calls', async () => {
      const compressed = await xzAsync(testData);
      const promises = Array.from({ length: 10 }, () => unxzAsync(compressed));

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.equals(testData)).toBe(true);
      });
    });

    it('should handle mixed compress/decompress operations', async () => {
      const testBuffers = Array.from({ length: 5 }, (_, i) => Buffer.from(`Test ${i} `.repeat(50)));

      const compressPromises = testBuffers.map((buf) => xzAsync(buf));
      const compressed = await Promise.all(compressPromises);

      const decompressPromises = compressed.map((buf) => unxzAsync(buf));
      const decompressed = await Promise.all(decompressPromises);

      testBuffers.forEach((original, i) => {
        expect(decompressed[i].equals(original)).toBe(true);
      });
    });
  });

  describe('Callback-based concurrent operations', () => {
    it('should handle multiple concurrent xz calls with callbacks', () => {
      return new Promise<void>((resolve) => {
        let completed = 0;
        const total = 10;
        const results: Buffer[] = [];

        for (let i = 0; i < total; i++) {
          xz(Buffer.from(`Data ${i} `.repeat(50)), (error, result) => {
            expect(error).toBeNull();
            expect(Buffer.isBuffer(result)).toBe(true);
            results.push(result as Buffer);
            completed++;
            if (completed === total) {
              expect(results).toHaveLength(total);
              resolve();
            }
          });
        }
      });
    });

    it('should handle concurrent unxz calls with callbacks', async () => {
      const compressed = await xzAsync(testData);

      return new Promise<void>((resolve) => {
        let completed = 0;
        const total = 10;

        for (let i = 0; i < total; i++) {
          unxz(compressed, (error, result) => {
            expect(error).toBeNull();
            expect((result as Buffer).equals(testData)).toBe(true);
            completed++;
            if (completed === total) {
              resolve();
            }
          });
        }
      });
    });
  });

  describe('Concurrent stream operations', () => {
    it('should handle multiple concurrent compression streams', () => {
      return new Promise<void>((resolve, reject) => {
        const streams = Array.from({ length: 5 }, () => createXz());
        let completed = 0;

        streams.forEach((stream, i) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            const result = Buffer.concat(chunks);
            expect(result.length).toBeGreaterThan(0);
            completed++;
            if (completed === streams.length) {
              resolve();
            }
          });
          stream.on('error', reject);
          stream.write(Buffer.from(`Stream ${i} data `.repeat(20)));
          stream.end();
        });
      });
    });

    it('should handle multiple concurrent decompression streams', async () => {
      const compressed = await xzAsync(testData);
      const streams = Array.from({ length: 5 }, () => createUnxz());

      const promises = streams.map((stream) => {
        return new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => resolve(Buffer.concat(chunks)));
          stream.on('error', reject);
          stream.write(compressed);
          stream.end();
        });
      });

      const results = await Promise.all(promises);
      results.forEach((result) => {
        expect(result.equals(testData)).toBe(true);
      });
    });
  });

  describe('Rate limiting and resource management', () => {
    it('should handle large number of sequential async operations', async () => {
      const iterations = 50;
      const results: Buffer[] = [];

      for (let i = 0; i < iterations; i++) {
        const compressed = await xzAsync(Buffer.from(`Iteration ${i} `.repeat(10)));
        const decompressed = await unxzAsync(compressed);
        results.push(decompressed);
      }

      expect(results).toHaveLength(iterations);
    });

    it('should handle concurrent operations with varying buffer sizes', async () => {
      const sizes = [100, 1000, 10000, 100000];
      const promises = sizes.map((size) => {
        const buf = Buffer.from('x'.repeat(size));
        return xzAsync(buf).then((compressed) => unxzAsync(compressed));
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(sizes.length);
      results.forEach((result, i) => {
        expect(result.length).toBe(sizes[i]);
      });
    });
  });

  describe('Stream pipeline stress test', () => {
    it('should handle rapid stream creation and destruction', () => {
      return new Promise<void>((resolve, reject) => {
        let created = 0;
        let destroyed = 0;
        const total = 20;

        const createAndDestroy = () => {
          if (created >= total) return;

          const stream = createXz();
          created++;

          stream.on('finish', () => {
            stream.destroy();
            destroyed++;
            if (destroyed === total) {
              resolve();
            } else {
              setImmediate(createAndDestroy);
            }
          });

          stream.on('error', reject);
          stream.write(Buffer.from('test'));
          stream.end();
        };

        // Start multiple streams simultaneously
        for (let i = 0; i < 5; i++) {
          createAndDestroy();
        }
      });
    });

    it('should handle interleaved read/write operations', () => {
      return new Promise<void>((resolve, reject) => {
        const source = Readable.from([
          Buffer.from('chunk1 '.repeat(100)),
          Buffer.from('chunk2 '.repeat(100)),
          Buffer.from('chunk3 '.repeat(100)),
        ]);

        const compressor = createXz();
        const decompressor = createUnxz();
        const chunks: Buffer[] = [];

        decompressor.on('data', (chunk: Buffer) => chunks.push(chunk));
        decompressor.on('end', () => {
          const result = Buffer.concat(chunks);
          expect(result.length).toBeGreaterThan(0);
          resolve();
        });
        decompressor.on('error', reject);

        source.pipe(compressor).pipe(decompressor);
      });
    });
  });

  describe('Error handling under concurrent load', () => {
    it('should handle multiple concurrent operations successfully', async () => {
      const validData = Buffer.from('valid data '.repeat(50));

      // Test that valid compressions work alongside each other
      const promises = [xzAsync(validData), xzAsync(validData), xzAsync(validData)];

      const results = await Promise.all(promises);

      // All operations should succeed
      expect(Buffer.isBuffer(results[0])).toBe(true);
      expect(Buffer.isBuffer(results[1])).toBe(true);
      expect(Buffer.isBuffer(results[2])).toBe(true);

      // Verify all results are properly compressed
      for (const result of results) {
        const decompressed = await unxzAsync(result);
        expect(decompressed.equals(validData)).toBe(true);
      }
    });
  });
});
