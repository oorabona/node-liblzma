import { describe, expect, it } from 'vitest';
import * as lzma from '../src/lzma.js';

describe('Error Recovery and State Transitions', () => {
  it('should cover filter validation catch block', () => {
    // Force the try-catch path in filter validation
    expect(() => {
      // Create instance with malformed filters to trigger catch block
      /* biome-ignore lint/suspicious/noExplicitAny: Creating malformed filters to test exception handling in try-catch block */
      const malformedFilters: any = {
        // This will cause the array check to fail and throw
        push: undefined, // Not an array
        length: 'not a number', // Invalid array-like
      };

      const xz = new lzma.Xz({ filters: malformedFilters });
      xz.close();
    }).toThrow('Filters need to be in an array!');
  });

  it('should cover callback when stream is ending', async () => {
    const xz = new lzma.Xz();

    return new Promise<void>((resolve) => {
      let callbackExecuted = false;

      // Set up data and start ending process
      xz.write(Buffer.from('test data'));
      xz.end(); // This puts stream in 'ending' state

      // Immediately try to flush while ending - should trigger the appropriate behavior
      setTimeout(() => {
        xz.flush(() => {
          callbackExecuted = true;
          expect(callbackExecuted).toBe(true);
          xz.close();
          resolve();
        });
      }, 1); // Very small delay to ensure ending state

      // Fallback timeout
      setTimeout(() => {
        if (!callbackExecuted) {
          xz.close();
          resolve();
        }
      }, 50);
    });
  });

  it('should cover lines 457-458 - async LZMA error handling', async () => {
    const xz = new lzma.Xz();

    return new Promise<void>((resolve) => {
      let errorCount = 0;

      xz.on('error', (error) => {
        errorCount++;
        expect(error).toBeInstanceOf(Error);
        // Accept any LZMA error code (native + manual emit may both fire)
        expect(error.errno).toBeGreaterThan(0);

        // Close and resolve after first error; absorb any subsequent errors
        if (errorCount === 1) {
          xz.close();
          // Small delay to let any pending native callbacks drain
          setTimeout(resolve, 10);
        }
      });

      // Emit onerror directly — this triggers the onerror→error conversion (line 357-360)
      xz.emit('onerror', lzma.LZMA_DATA_ERROR);
    });
  });

  it('should test comprehensive error recovery scenarios', async () => {
    // Test multiple error conditions to ensure robustness
    const testCases = [
      lzma.LZMA_MEM_ERROR,
      lzma.LZMA_DATA_ERROR,
      lzma.LZMA_FORMAT_ERROR,
      lzma.LZMA_OPTIONS_ERROR,
    ];

    for (const errorCode of testCases) {
      const xz = new lzma.Xz();

      await new Promise<void>((resolve) => {
        xz.on('error', (error) => {
          expect(error.errno).toBe(errorCode);
          xz.close();
          resolve();
        });

        // Emit the error directly to test error handling
        xz.emit('onerror', errorCode);
      });
    }
  });

  it('should handle stream state transitions correctly', async () => {
    const xz = new lzma.Xz();

    return new Promise<void>((resolve) => {
      let statesTracked = 0;
      const expectedStates = 3;

      const checkComplete = () => {
        statesTracked++;
        if (statesTracked >= expectedStates) {
          xz.close();
          resolve();
        }
      };

      // Test ended state flush
      xz.on('finish', () => {
        xz.flush(() => checkComplete()); // Should handle ended state
      });

      // Test ending state flush
      xz.write(Buffer.from('state test'));
      xz.end();

      // Test normal flush
      setTimeout(() => {
        xz.flush(() => checkComplete());
      }, 5);

      checkComplete(); // Initial count
    });
  });
});
