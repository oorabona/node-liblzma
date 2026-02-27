import { describe, expect, it } from 'vitest';
import { unxzAsync, xzAsync } from '../../src/lzma.js';

describe('Async Error Handling', () => {
  describe('xzAsync', () => {
    it('should reject promise on compression error', async () => {
      // Use invalid filters array that will cause an error
      const invalidOptions = {
        /* biome-ignore lint/suspicious/noExplicitAny: Testing async error handling with invalid filter type */
        filters: 'not-an-array' as any, // Should be array but passing string
      };

      await expect(xzAsync('test data', invalidOptions)).rejects.toThrow(
        'Filters need to be in an array!'
      );
    });

    it('should reject promise on invalid input type', async () => {
      // Pass truly invalid input that causes validation error
      /* biome-ignore lint/suspicious/noExplicitAny: Testing async error handling with invalid input type */
      const invalidInput = 123 as any; // Number instead of Buffer/string

      await expect(xzAsync(invalidInput)).rejects.toThrow();
    });
  });

  describe('unxzAsync', () => {
    it('should reject promise on decompression error', async () => {
      // Pass invalid compressed data
      const invalidCompressed = Buffer.from('not compressed data');

      await expect(unxzAsync(invalidCompressed)).rejects.toThrow();
    });

    it('should reject promise with invalid filters option', async () => {
      const validCompressed = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]); // Valid XZ header
      const invalidOptions = {
        /* biome-ignore lint/suspicious/noExplicitAny: Testing async error handling with invalid filter type */
        filters: 'invalid-filters' as any, // Should be array
      };

      await expect(unxzAsync(validCompressed, invalidOptions)).rejects.toThrow(
        'Filters need to be in an array!'
      );
    });
  });
});
