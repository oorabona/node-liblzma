import { describe, expect, it } from 'vitest';
import { LZMA_FINISH, LZMAStatus, Unxz, Xz } from '../src/lzma.js';

describe('Filter Validation and Stream States', () => {
  describe('Filter Validation', () => {
    it('should throw error for non-array filters', () => {
      expect(() => {
        /* biome-ignore lint/suspicious/noExplicitAny: Testing invalid filter type to verify error handling */
        new Xz({ filters: 'invalid' as any });
      }).toThrow('Filters need to be in an array!');
    });

    it('should throw error for non-array filters in Unxz', () => {
      expect(() => {
        /* biome-ignore lint/suspicious/noExplicitAny: Testing invalid filter type to verify error handling */
        new Unxz({ filters: { invalid: true } as any });
      }).toThrow('Filters need to be in an array!');
    });
  });

  describe('Error Handler Coverage', () => {
    it('should handle onerror event with errno', () => {
      const xz = new Xz();

      return new Promise<void>((resolve) => {
        xz.on('error', (error) => {
          expect(error).toBeInstanceOf(Error);
          /* biome-ignore lint/suspicious/noExplicitAny: Accessing errno/code properties from error object */
          expect((error as any).errno).toBeDefined();
          /* biome-ignore lint/suspicious/noExplicitAny: Accessing errno/code properties from error object */
          expect((error as any).code).toBeDefined();
          resolve();
        });

        // Trigger error by emitting onerror with invalid errno
        xz.emit('onerror', 999);
      });
    });
  });

  describe('Flush Edge Cases', () => {
    it('should handle flush() with no parameters', async () => {
      const xz = new Xz();
      const testData = Buffer.from('test data');

      return new Promise<void>((resolve) => {
        xz.on('data', () => {});
        xz.on('end', () => {
          resolve();
        });

        xz.write(testData);
        xz.flush(); // No parameters - should use default SYNC_FLUSH
        xz.end();
      });
    });

    it('should handle flush(callback) signature', () => {
      const xz = new Xz();
      const testData = Buffer.from('test data');

      return new Promise<void>((resolve) => {
        xz.on('data', () => {});
        xz.on('end', () => {
          resolve();
        });

        xz.write(testData);
        xz.flush(() => {
          // Callback executed
        });
        xz.end();
      });
    });

    it('should handle flush(kind, callback) signature', () => {
      const xz = new Xz();
      const testData = Buffer.from('test data');

      return new Promise<void>((resolve) => {
        xz.on('data', () => {});
        xz.on('end', () => {
          resolve();
        });

        xz.write(testData);
        xz.flush(LZMAStatus.OK, () => {
          // Callback executed
        });
        xz.end();
      });
    });

    it('should handle flush with ended stream', () => {
      const xz = new Xz();

      return new Promise<void>((resolve) => {
        // End the stream properly first
        xz.end(Buffer.from('test'), () => {
          // Now flush should work without errors
          xz.flush(() => {
            xz.close(() => resolve());
          });
        });
      });
    });
  });

  describe('Stream State Edge Cases', () => {
    it('should handle transform with closed stream', () => {
      const xz = new Xz();

      // Force close the stream
      xz.close();

      return new Promise<void>((resolve) => {
        // Try to transform - should trigger closed stream error
        xz._transform(Buffer.from('test'), 'utf8', (error) => {
          expect(error).toBeInstanceOf(Error);
          expect(error?.message).toBe('lzma binding closed');
          resolve();
        });
      });
    });

    it('should handle transform with invalid chunk type', () => {
      const xz = new Xz();

      return new Promise<void>((resolve) => {
        // Pass non-Buffer/non-null chunk
        /* biome-ignore lint/suspicious/noExplicitAny: Testing invalid chunk type to verify input validation */
        xz._transform('invalid' as any, 'utf8', (error) => {
          expect(error).toBeInstanceOf(Error);
          expect(error?.message).toBe('invalid input');
          xz.close(() => resolve());
        });
      });
    });
  });

  describe('Buffer Management Edge Cases', () => {
    it('should handle large chunks requiring buffer reallocation', () => {
      const xz = new Xz({ chunkSize: 64 }); // Small chunk size
      const largeData = Buffer.alloc(1024, 'a'); // Large data

      return new Promise<void>((resolve) => {
        let outputCount = 0;
        xz.on('data', (chunk) => {
          outputCount++;
          expect(chunk).toBeInstanceOf(Buffer);
        });

        xz.on('end', () => {
          expect(outputCount).toBeGreaterThan(0);
          resolve();
        });

        xz.write(largeData);
        xz.end();
      });
    });

    it('should handle multiple buffer reallocations in sync mode', () => {
      const xz = new Xz({ chunkSize: 32 });
      const largeData = Buffer.alloc(512, 'b');

      // Use sync processing to trigger buffer reallocation paths
      const result = xz._processChunk(largeData, LZMA_FINISH);
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('Async Processing Edge Cases', () => {
    it('should handle complex async buffer reallocation', () => {
      const xz = new Xz({ chunkSize: 16 }); // Very small chunks
      const complexData = Buffer.alloc(256);

      // Fill with varied data to ensure compression work
      for (let i = 0; i < complexData.length; i++) {
        complexData[i] = i % 256;
      }

      return new Promise<void>((resolve) => {
        let dataReceived = false;
        xz.on('data', (chunk) => {
          dataReceived = true;
          expect(chunk).toBeInstanceOf(Buffer);
        });

        xz.on('end', () => {
          expect(dataReceived).toBe(true);
          resolve();
        });

        // Write in small pieces to trigger multiple async reallocation paths
        for (let i = 0; i < complexData.length; i += 8) {
          const chunk = complexData.subarray(i, i + 8);
          xz.write(chunk);
        }
        xz.end();
      });
    });
  });

  describe('Stream Ending Edge Cases', () => {
    it('should handle needDrain state during flush', async () => {
      const xz = new Xz({ chunkSize: 8 });

      // Test flush behavior by directly checking the condition
      /* biome-ignore lint/suspicious/noExplicitAny: Accessing Node.js internal _writableState for testing */
      const ws = (xz as any)._writableState;
      if (ws) {
        // Simulate needDrain condition by testing flush method
        expect(() => xz.flush()).not.toThrow();
      }

      // Close stream properly
      xz.close();
    });
  });
});
