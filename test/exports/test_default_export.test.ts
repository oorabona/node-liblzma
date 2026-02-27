import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Test default export for CommonJS compatibility
const require = createRequire(import.meta.url);

describe('Default Export Tests', () => {
  describe('CommonJS compatibility', () => {
    it('should export all main functions via default export', () => {
      // Test CommonJS require
      const lzma = require('../../lib/lzma.js');

      // Core classes
      expect(lzma.default.Xz).toBeDefined();
      expect(lzma.default.Unxz).toBeDefined();
      expect(lzma.default.XzStream).toBeDefined();

      // Factory functions
      expect(lzma.default.createXz).toBeDefined();
      expect(lzma.default.createUnxz).toBeDefined();

      // Utility functions
      expect(lzma.default.hasThreads).toBeDefined();
      expect(lzma.default.xz).toBeDefined();
      expect(lzma.default.unxz).toBeDefined();
      expect(lzma.default.xzSync).toBeDefined();
      expect(lzma.default.unxzSync).toBeDefined();
      expect(lzma.default.xzAsync).toBeDefined();
      expect(lzma.default.unxzAsync).toBeDefined();
    });

    it('should export all constants via default export', () => {
      const lzma = require('../../lib/lzma.js');

      // Constant objects
      expect(lzma.default.check).toBeDefined();
      expect(lzma.default.preset).toBeDefined();
      expect(lzma.default.flag).toBeDefined();
      expect(lzma.default.filter).toBeDefined();
      expect(lzma.default.mode).toBeDefined();

      // Messages
      expect(lzma.default.messages).toBeDefined();
      expect(Array.isArray(lzma.default.messages)).toBe(true);

      // Action constants
      expect(lzma.default.LZMA_RUN).toBeDefined();
      expect(lzma.default.LZMA_SYNC_FLUSH).toBeDefined();
      expect(lzma.default.LZMA_FULL_FLUSH).toBeDefined();
      expect(lzma.default.LZMA_FINISH).toBeDefined();

      // Status constants
      expect(lzma.default.LZMA_OK).toBeDefined();
      expect(lzma.default.LZMA_STREAM_END).toBeDefined();
      expect(lzma.default.LZMA_MEM_ERROR).toBeDefined();
    });

    it('should have functional createXz and createUnxz in default export', () => {
      const lzma = require('../../lib/lzma.js');

      const xzStream = lzma.default.createXz();
      expect(xzStream).toBeInstanceOf(lzma.default.Xz);
      xzStream.close();

      const unxzStream = lzma.default.createUnxz();
      expect(unxzStream).toBeInstanceOf(lzma.default.Unxz);
      unxzStream.close();
    });

    it('should have working sync functions in default export', () => {
      const lzma = require('../../lib/lzma.js');

      const testData = 'Test data for default export';
      const compressed = lzma.default.xzSync(testData);
      expect(compressed).toBeInstanceOf(Buffer);
      expect(compressed.length).toBeGreaterThan(0);

      const decompressed = lzma.default.unxzSync(compressed);
      expect(decompressed.toString()).toBe(testData);
    });

    it('should have working async functions in default export', () => {
      const lzma = require('../../lib/lzma.js');

      const testData = 'Test data for async default export';

      return new Promise<void>((resolve) => {
        lzma.default.xz(testData, (error, compressed) => {
          expect(error).toBeNull();
          expect(compressed).toBeInstanceOf(Buffer);
          expect(compressed.length).toBeGreaterThan(0);

          lzma.default.unxz(compressed, (error, decompressed) => {
            expect(error).toBeNull();
            expect(decompressed.toString()).toBe(testData);
            resolve();
          });
        });
      });
    });

    it('should have working Promise functions in default export', async () => {
      const lzma = require('../../lib/lzma.js');

      const testData = 'Test data for Promise default export';

      const compressed = await lzma.default.xzAsync(testData);
      expect(compressed).toBeInstanceOf(Buffer);
      expect(compressed.length).toBeGreaterThan(0);

      const decompressed = await lzma.default.unxzAsync(compressed);
      expect(decompressed.toString()).toBe(testData);
    });

    it('should have all filter constants in default export', () => {
      const lzma = require('../../lib/lzma.js');

      // Individual filter constants
      expect(lzma.default.LZMA_FILTER_X86).toBeDefined();
      expect(lzma.default.LZMA_FILTER_POWERPC).toBeDefined();
      expect(lzma.default.LZMA_FILTER_IA64).toBeDefined();
      expect(lzma.default.LZMA_FILTER_ARM).toBeDefined();
      expect(lzma.default.LZMA_FILTER_ARMTHUMB).toBeDefined();
      expect(lzma.default.LZMA_FILTERS_MAX).toBeDefined();

      // All should be numbers
      expect(typeof lzma.default.LZMA_FILTER_X86).toBe('number');
      expect(typeof lzma.default.LZMA_FILTER_POWERPC).toBe('number');
      expect(typeof lzma.default.LZMA_FILTER_IA64).toBe('number');
      expect(typeof lzma.default.LZMA_FILTER_ARM).toBe('number');
      expect(typeof lzma.default.LZMA_FILTER_ARMTHUMB).toBe('number');
      expect(typeof lzma.default.LZMA_FILTERS_MAX).toBe('number');
    });
  });

  describe('ESM import compatibility', () => {
    it('should work with named imports', async () => {
      // Dynamic import to test ESM compatibility
      const { xzSync, unxzSync, createXz, createUnxz } = await import('../../src/lzma.js');

      expect(xzSync).toBeDefined();
      expect(unxzSync).toBeDefined();
      expect(createXz).toBeDefined();
      expect(createUnxz).toBeDefined();

      const testData = 'Test ESM import';
      const compressed = xzSync(testData);
      const decompressed = unxzSync(compressed);
      expect(decompressed.toString()).toBe(testData);
    });

    it('should work with default import', async () => {
      // Dynamic import of default export
      const lzmaDefault = await import('../../src/lzma.js').then((m) => m.default);

      expect(lzmaDefault.xzSync).toBeDefined();
      expect(lzmaDefault.unxzSync).toBeDefined();

      const testData = 'Test ESM default import';
      const compressed = lzmaDefault.xzSync(testData);
      const decompressed = lzmaDefault.unxzSync(compressed);
      expect(decompressed.toString()).toBe(testData);
    });

    it('should have consistent constants between named and default exports', async () => {
      const { LZMA_RUN, LZMA_OK, check } = await import('../../src/lzma.js');
      const lzmaDefault = await import('../../src/lzma.js').then((m) => m.default);

      // Constants should be identical between exports
      expect(LZMA_RUN).toBe(lzmaDefault.LZMA_RUN);
      expect(LZMA_OK).toBe(lzmaDefault.LZMA_OK);
      expect(check.CRC32).toBe(lzmaDefault.check.CRC32);
    });
  });

  describe('Export completeness', () => {
    it('should export all grouped constants', async () => {
      const { LZMAAction, LZMAStatus, LZMAFilter } = await import('../../src/lzma.js');

      // LZMAAction group
      expect(LZMAAction.RUN).toBeDefined();
      expect(LZMAAction.SYNC_FLUSH).toBeDefined();
      expect(LZMAAction.FULL_FLUSH).toBeDefined();
      expect(LZMAAction.FINISH).toBeDefined();

      // LZMAStatus group
      expect(LZMAStatus.OK).toBeDefined();
      expect(LZMAStatus.STREAM_END).toBeDefined();
      expect(LZMAStatus.MEM_ERROR).toBeDefined();

      // LZMAFilter group
      expect(LZMAFilter.LZMA2).toBeDefined();
      expect(LZMAFilter.X86).toBeDefined();
      expect(LZMAFilter.FILTERS_MAX).toBeDefined();
    });

    it('should export error message enum', async () => {
      const { LZMAErrorMessage } = await import('../../src/lzma.js');

      expect(LZMAErrorMessage.SUCCESS).toBe('Operation completed successfully');
      expect(LZMAErrorMessage.STREAM_END).toBe('End of stream was reached');
      expect(LZMAErrorMessage.MEM_ERROR).toBe('Cannot allocate memory');
    });

    it('should export all type definitions implicitly', async () => {
      // TypeScript should validate these types are available
      const { createXz } = await import('../../src/lzma.js');

      // Create stream with typed options
      const stream = createXz({
        check: 1, // CheckType
        preset: 6, // PresetType
        mode: 2, // ModeType
        threads: 1,
      });

      expect(stream).toBeDefined();
      stream.close();
    });
  });
});
