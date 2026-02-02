/**
 * Tests for progress events in compression/decompression streams
 */
import { describe, expect, it } from 'vitest';
import type { ProgressInfo } from '../src/lzma.js';
import { createUnxz, createXz } from '../src/lzma.js';

describe('Progress Events', () => {
  const testData = Buffer.alloc(100_000, 'A'); // 100KB of data

  describe('compression', () => {
    it('should emit progress events during compression', async () => {
      const compressor = createXz();
      const progressEvents: ProgressInfo[] = [];

      compressor.on('progress', (info) => {
        progressEvents.push({ ...info });
      });

      const chunks: Buffer[] = [];
      compressor.on('data', (chunk: Buffer) => chunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        compressor.on('end', resolve);
        compressor.on('error', reject);
        compressor.end(testData);
      });

      // Should have received at least one progress event
      expect(progressEvents.length).toBeGreaterThan(0);

      // Check that bytesRead increases monotonically
      for (let i = 1; i < progressEvents.length; i++) {
        expect(progressEvents[i].bytesRead).toBeGreaterThanOrEqual(progressEvents[i - 1].bytesRead);
        expect(progressEvents[i].bytesWritten).toBeGreaterThanOrEqual(
          progressEvents[i - 1].bytesWritten
        );
      }

      // Final progress should show all input bytes were read
      const lastProgress = progressEvents[progressEvents.length - 1];
      expect(lastProgress.bytesRead).toBe(testData.length);
      expect(lastProgress.bytesWritten).toBeGreaterThan(0);
    });

    it('should expose bytesRead and bytesWritten getters', async () => {
      const compressor = createXz();

      expect(compressor.bytesRead).toBe(0);
      expect(compressor.bytesWritten).toBe(0);

      const chunks: Buffer[] = [];
      compressor.on('data', (chunk: Buffer) => chunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        compressor.on('end', resolve);
        compressor.on('error', reject);
        compressor.end(testData);
      });

      expect(compressor.bytesRead).toBe(testData.length);
      expect(compressor.bytesWritten).toBeGreaterThan(0);
    });
  });

  describe('decompression', () => {
    it('should emit progress events during decompression', async () => {
      // First compress the data
      const compressor = createXz();
      const compressedChunks: Buffer[] = [];
      compressor.on('data', (chunk: Buffer) => compressedChunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        compressor.on('end', resolve);
        compressor.on('error', reject);
        compressor.end(testData);
      });

      const compressed = Buffer.concat(compressedChunks);

      // Now decompress and check progress events
      const decompressor = createUnxz();
      const progressEvents: ProgressInfo[] = [];

      decompressor.on('progress', (info) => {
        progressEvents.push({ ...info });
      });

      const decompressedChunks: Buffer[] = [];
      decompressor.on('data', (chunk: Buffer) => decompressedChunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        decompressor.on('end', resolve);
        decompressor.on('error', reject);
        decompressor.end(compressed);
      });

      // Should have received at least one progress event
      expect(progressEvents.length).toBeGreaterThan(0);

      // Check that values increase monotonically
      for (let i = 1; i < progressEvents.length; i++) {
        expect(progressEvents[i].bytesRead).toBeGreaterThanOrEqual(progressEvents[i - 1].bytesRead);
        expect(progressEvents[i].bytesWritten).toBeGreaterThanOrEqual(
          progressEvents[i - 1].bytesWritten
        );
      }

      // Final progress should match expected values
      const lastProgress = progressEvents[progressEvents.length - 1];
      expect(lastProgress.bytesRead).toBe(compressed.length);
      expect(lastProgress.bytesWritten).toBe(testData.length);
    });

    it('should expose bytesRead and bytesWritten getters', async () => {
      // First compress the data
      const compressor = createXz();
      const compressedChunks: Buffer[] = [];
      compressor.on('data', (chunk: Buffer) => compressedChunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        compressor.on('end', resolve);
        compressor.on('error', reject);
        compressor.end(testData);
      });

      const compressed = Buffer.concat(compressedChunks);

      // Decompress and check getters
      const decompressor = createUnxz();

      expect(decompressor.bytesRead).toBe(0);
      expect(decompressor.bytesWritten).toBe(0);

      const decompressedChunks: Buffer[] = [];
      decompressor.on('data', (chunk: Buffer) => decompressedChunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        decompressor.on('end', resolve);
        decompressor.on('error', reject);
        decompressor.end(compressed);
      });

      expect(decompressor.bytesRead).toBe(compressed.length);
      expect(decompressor.bytesWritten).toBe(testData.length);
    });
  });

  describe('multiple chunks', () => {
    it('should accumulate progress across multiple write calls', async () => {
      const compressor = createXz();
      const progressEvents: ProgressInfo[] = [];

      compressor.on('progress', (info) => {
        progressEvents.push({ ...info });
      });

      const chunks: Buffer[] = [];
      compressor.on('data', (chunk: Buffer) => chunks.push(chunk));

      // Write data in multiple chunks
      const chunkSize = 10_000;
      const numChunks = 5;
      const totalSize = chunkSize * numChunks;

      await new Promise<void>((resolve, reject) => {
        compressor.on('end', resolve);
        compressor.on('error', reject);

        for (let i = 0; i < numChunks; i++) {
          compressor.write(Buffer.alloc(chunkSize, String.fromCharCode(65 + i)));
        }
        compressor.end();
      });

      // Final bytesRead should equal total input size
      expect(compressor.bytesRead).toBe(totalSize);
      expect(compressor.bytesWritten).toBeGreaterThan(0);

      // Progress events should show accumulated values
      const lastProgress = progressEvents[progressEvents.length - 1];
      expect(lastProgress.bytesRead).toBe(totalSize);
    });
  });
});
