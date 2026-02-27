/**
 * Comprehensive tests for LZMA error classes
 * Target: 100% coverage for src/errors.ts
 */
import { describe, expect, it } from 'vitest';
import {
  createLZMAError,
  LZMABufferError,
  LZMADataError,
  LZMAError,
  LZMAFormatError,
  LZMAMemoryError,
  LZMAMemoryLimitError,
  LZMAOptionsError,
  LZMAProgrammingError,
} from '../../src/errors.js';

// LZMA error codes (from liblzma)
const LZMA_OK = 0;
const LZMA_STREAM_END = 1;
const LZMA_NO_CHECK = 2;
const LZMA_UNSUPPORTED_CHECK = 3;
const LZMA_GET_CHECK = 4;
const LZMA_MEM_ERROR = 5;
const LZMA_MEMLIMIT_ERROR = 6;
const LZMA_FORMAT_ERROR = 7;
const LZMA_OPTIONS_ERROR = 8;
const LZMA_DATA_ERROR = 9;
const LZMA_BUF_ERROR = 10;
const LZMA_PROG_ERROR = 11;

describe('LZMA Error Classes', () => {
  describe('LZMAError base class', () => {
    it('should create error with correct properties', () => {
      const error = new LZMAError('Test error', 42);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(LZMAError);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('LZMAError');
      expect(error.errno).toBe(42);
      expect(error.code).toBe(42);
      expect(error.stack).toBeDefined();
    });

    it('should have correct stack trace', () => {
      const error = new LZMAError('Stack test', 1);
      expect(error.stack).toContain('LZMAError');
      expect(error.stack).toContain('Stack test');
    });
  });

  describe('LZMAMemoryError', () => {
    it('should create memory error with correct properties', () => {
      const error = new LZMAMemoryError(LZMA_MEM_ERROR);

      expect(error).toBeInstanceOf(LZMAError);
      expect(error).toBeInstanceOf(LZMAMemoryError);
      expect(error.message).toBe('Cannot allocate memory');
      expect(error.name).toBe('LZMAMemoryError');
      expect(error.errno).toBe(LZMA_MEM_ERROR);
    });

    it('should be distinguishable with instanceof', () => {
      const error = new LZMAMemoryError(LZMA_MEM_ERROR);
      expect(error instanceof LZMAMemoryError).toBe(true);
      expect(error instanceof LZMADataError).toBe(false);
    });
  });

  describe('LZMAMemoryLimitError', () => {
    it('should create memory limit error with correct properties', () => {
      const error = new LZMAMemoryLimitError(LZMA_MEMLIMIT_ERROR);

      expect(error).toBeInstanceOf(LZMAError);
      expect(error).toBeInstanceOf(LZMAMemoryLimitError);
      expect(error.message).toBe('Memory usage limit was reached');
      expect(error.name).toBe('LZMAMemoryLimitError');
      expect(error.errno).toBe(LZMA_MEMLIMIT_ERROR);
    });
  });

  describe('LZMAFormatError', () => {
    it('should create format error with correct properties', () => {
      const error = new LZMAFormatError(LZMA_FORMAT_ERROR);

      expect(error).toBeInstanceOf(LZMAError);
      expect(error).toBeInstanceOf(LZMAFormatError);
      expect(error.message).toBe('File format not recognized');
      expect(error.name).toBe('LZMAFormatError');
      expect(error.errno).toBe(LZMA_FORMAT_ERROR);
    });
  });

  describe('LZMAOptionsError', () => {
    it('should create options error with correct properties', () => {
      const error = new LZMAOptionsError(LZMA_OPTIONS_ERROR);

      expect(error).toBeInstanceOf(LZMAError);
      expect(error).toBeInstanceOf(LZMAOptionsError);
      expect(error.message).toBe('Invalid or unsupported options');
      expect(error.name).toBe('LZMAOptionsError');
      expect(error.errno).toBe(LZMA_OPTIONS_ERROR);
    });
  });

  describe('LZMADataError', () => {
    it('should create data error with correct properties', () => {
      const error = new LZMADataError(LZMA_DATA_ERROR);

      expect(error).toBeInstanceOf(LZMAError);
      expect(error).toBeInstanceOf(LZMADataError);
      expect(error.message).toBe('Data is corrupt');
      expect(error.name).toBe('LZMADataError');
      expect(error.errno).toBe(LZMA_DATA_ERROR);
    });
  });

  describe('LZMABufferError', () => {
    it('should create buffer error with correct properties', () => {
      const error = new LZMABufferError(LZMA_BUF_ERROR);

      expect(error).toBeInstanceOf(LZMAError);
      expect(error).toBeInstanceOf(LZMABufferError);
      expect(error.message).toBe('No progress is possible');
      expect(error.name).toBe('LZMABufferError');
      expect(error.errno).toBe(LZMA_BUF_ERROR);
    });
  });

  describe('LZMAProgrammingError', () => {
    it('should create programming error with correct properties', () => {
      const error = new LZMAProgrammingError(LZMA_PROG_ERROR);

      expect(error).toBeInstanceOf(LZMAError);
      expect(error).toBeInstanceOf(LZMAProgrammingError);
      expect(error.message).toBe('Programming error');
      expect(error.name).toBe('LZMAProgrammingError');
      expect(error.errno).toBe(LZMA_PROG_ERROR);
    });
  });

  describe('createLZMAError factory', () => {
    it('should create LZMAMemoryError for LZMA_MEM_ERROR', () => {
      const error = createLZMAError(LZMA_MEM_ERROR);
      expect(error).toBeInstanceOf(LZMAMemoryError);
      expect(error.errno).toBe(LZMA_MEM_ERROR);
    });

    it('should create LZMAMemoryLimitError for LZMA_MEMLIMIT_ERROR', () => {
      const error = createLZMAError(LZMA_MEMLIMIT_ERROR);
      expect(error).toBeInstanceOf(LZMAMemoryLimitError);
      expect(error.errno).toBe(LZMA_MEMLIMIT_ERROR);
    });

    it('should create LZMAFormatError for LZMA_FORMAT_ERROR', () => {
      const error = createLZMAError(LZMA_FORMAT_ERROR);
      expect(error).toBeInstanceOf(LZMAFormatError);
      expect(error.errno).toBe(LZMA_FORMAT_ERROR);
    });

    it('should create LZMAOptionsError for LZMA_OPTIONS_ERROR', () => {
      const error = createLZMAError(LZMA_OPTIONS_ERROR);
      expect(error).toBeInstanceOf(LZMAOptionsError);
      expect(error.errno).toBe(LZMA_OPTIONS_ERROR);
    });

    it('should create LZMADataError for LZMA_DATA_ERROR', () => {
      const error = createLZMAError(LZMA_DATA_ERROR);
      expect(error).toBeInstanceOf(LZMADataError);
      expect(error.errno).toBe(LZMA_DATA_ERROR);
    });

    it('should create LZMABufferError for LZMA_BUF_ERROR', () => {
      const error = createLZMAError(LZMA_BUF_ERROR);
      expect(error).toBeInstanceOf(LZMABufferError);
      expect(error.errno).toBe(LZMA_BUF_ERROR);
    });

    it('should create LZMAProgrammingError for LZMA_PROG_ERROR', () => {
      const error = createLZMAError(LZMA_PROG_ERROR);
      expect(error).toBeInstanceOf(LZMAProgrammingError);
      expect(error.errno).toBe(LZMA_PROG_ERROR);
    });

    it('should create base LZMAError for LZMA_OK (success code)', () => {
      const error = createLZMAError(LZMA_OK);
      expect(error).toBeInstanceOf(LZMAError);
      expect(error).not.toBeInstanceOf(LZMAMemoryError);
      expect(error.message).toBe('Operation completed successfully');
      expect(error.errno).toBe(LZMA_OK);
    });

    it('should create base LZMAError for LZMA_STREAM_END', () => {
      const error = createLZMAError(LZMA_STREAM_END);
      expect(error).toBeInstanceOf(LZMAError);
      expect(error.message).toBe('End of stream was reached');
      expect(error.errno).toBe(LZMA_STREAM_END);
    });

    it('should create base LZMAError for LZMA_NO_CHECK', () => {
      const error = createLZMAError(LZMA_NO_CHECK);
      expect(error).toBeInstanceOf(LZMAError);
      expect(error.message).toBe('Input stream has no integrity check');
      expect(error.errno).toBe(LZMA_NO_CHECK);
    });

    it('should create base LZMAError for LZMA_UNSUPPORTED_CHECK', () => {
      const error = createLZMAError(LZMA_UNSUPPORTED_CHECK);
      expect(error).toBeInstanceOf(LZMAError);
      expect(error.message).toBe('Cannot calculate the integrity check');
      expect(error.errno).toBe(LZMA_UNSUPPORTED_CHECK);
    });

    it('should create base LZMAError for LZMA_GET_CHECK', () => {
      const error = createLZMAError(LZMA_GET_CHECK);
      expect(error).toBeInstanceOf(LZMAError);
      expect(error.message).toBe('Integrity check type is not available');
      expect(error.errno).toBe(LZMA_GET_CHECK);
    });

    it('should use custom message when provided', () => {
      const customMessage = 'Custom error message';
      const error = createLZMAError(LZMA_OK, customMessage);
      expect(error.message).toBe(customMessage);
    });

    it('should handle unknown errno codes gracefully', () => {
      const error = createLZMAError(999);
      expect(error).toBeInstanceOf(LZMAError);
      // F-011: Explicit error message for unknown codes instead of clamping
      expect(error.message).toBe('Unknown LZMA error code: 999');
      expect(error.errno).toBe(999);
    });

    it('should handle negative errno codes', () => {
      const error = createLZMAError(-1);
      expect(error).toBeInstanceOf(LZMAError);
      // F-011: Explicit error message for out-of-bounds codes
      expect(error.message).toBe('Unknown LZMA error code: -1');
      expect(error.errno).toBe(-1);
    });

    it('should handle very large errno codes', () => {
      const error = createLZMAError(10000);
      expect(error).toBeInstanceOf(LZMAError);
      // F-011: Explicit error message for unknown codes instead of clamping
      expect(error.message).toBe('Unknown LZMA error code: 10000');
      expect(error.errno).toBe(10000);
    });
  });

  describe('Type guards with instanceof', () => {
    it('should allow type narrowing with LZMAMemoryError', () => {
      const error = createLZMAError(LZMA_MEM_ERROR);
      if (error instanceof LZMAMemoryError) {
        expect(error.message).toBe('Cannot allocate memory');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should allow type narrowing with LZMADataError', () => {
      const error = createLZMAError(LZMA_DATA_ERROR);
      if (error instanceof LZMADataError) {
        expect(error.message).toBe('Data is corrupt');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should correctly distinguish between error types', () => {
      const memError = createLZMAError(LZMA_MEM_ERROR);
      const dataError = createLZMAError(LZMA_DATA_ERROR);

      expect(memError instanceof LZMAMemoryError).toBe(true);
      expect(memError instanceof LZMADataError).toBe(false);

      expect(dataError instanceof LZMADataError).toBe(true);
      expect(dataError instanceof LZMAMemoryError).toBe(false);
    });

    it('should work in catch blocks for error handling', () => {
      try {
        throw createLZMAError(LZMA_FORMAT_ERROR);
      } catch (error) {
        expect(error instanceof LZMAFormatError).toBe(true);
        if (error instanceof LZMAFormatError) {
          expect(error.message).toBe('File format not recognized');
        }
      }
    });

    it('should maintain Error inheritance chain', () => {
      const error = createLZMAError(LZMA_MEM_ERROR);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof LZMAError).toBe(true);
      expect(error instanceof LZMAMemoryError).toBe(true);
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should handle errno at array boundaries', () => {
      // Test first index (0)
      const first = createLZMAError(0);
      expect(first.message).toBe('Operation completed successfully');

      // Test last valid index (11)
      const last = createLZMAError(11);
      expect(last.message).toBe('Programming error');
    });

    it('should handle errno just outside boundaries', () => {
      // F-011: Out-of-bounds codes now return explicit unknown message
      // Just below 0
      const below = createLZMAError(-1);
      expect(below.message).toBe('Unknown LZMA error code: -1');

      // Just above 11
      const above = createLZMAError(12);
      expect(above.message).toBe('Unknown LZMA error code: 12');
    });

    it('should preserve all error properties across factory creation', () => {
      const errors = [
        LZMA_MEM_ERROR,
        LZMA_MEMLIMIT_ERROR,
        LZMA_FORMAT_ERROR,
        LZMA_OPTIONS_ERROR,
        LZMA_DATA_ERROR,
        LZMA_BUF_ERROR,
        LZMA_PROG_ERROR,
      ];

      for (const errno of errors) {
        const error = createLZMAError(errno);
        expect(error.errno).toBe(errno);
        expect(error.code).toBe(errno);
        expect(error.name).toBeTruthy();
        expect(error.message).toBeTruthy();
        expect(error.stack).toBeTruthy();
      }
    });
  });
});
