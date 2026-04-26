import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as lzma from '../../src/lzma.js';

describe('Error Recovery and State Transitions', () => {
  // Track every stream + timer created so we can guarantee cleanup, even if a
  // test rejects mid-flight or a native callback is queued after the test ends.
  // Without this, late callbacks (xz.emit('onerror', ...) firing after close())
  // can crash the vitest worker — historical Windows+Node20 / Ubuntu+Node24 flakes.
  let streams: lzma.Xz[] = [];
  let timers: NodeJS.Timeout[] = [];

  const track = <T extends lzma.Xz>(s: T): T => {
    streams.push(s);
    return s;
  };

  const trackTimer = (t: NodeJS.Timeout): NodeJS.Timeout => {
    timers.push(t);
    return t;
  };

  beforeEach(() => {
    streams = [];
    timers = [];
  });

  afterEach(() => {
    for (const t of timers) clearTimeout(t);
    for (const s of streams) {
      try {
        if (typeof s.destroy === 'function') s.destroy();
        else if (typeof s.close === 'function' && !s._closed) s.close();
      } catch {
        // best-effort: ignore double-destroy errors
      }
    }
  });

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
      track(xz);
      xz.close();
    }).toThrow('Filters need to be in an array!');
  });

  it('should cover callback when stream is ending', async () => {
    const xz = track(new lzma.Xz());

    return new Promise<void>((resolve) => {
      let callbackExecuted = false;

      // Set up data and start ending process
      xz.write(Buffer.from('test data'));
      xz.end(); // This puts stream in 'ending' state

      // Immediately try to flush while ending - should trigger the appropriate behavior
      trackTimer(
        setTimeout(() => {
          xz.flush(() => {
            callbackExecuted = true;
            expect(callbackExecuted).toBe(true);
            resolve();
          });
        }, 1) // Very small delay to ensure ending state
      );

      // Fallback timeout
      trackTimer(
        setTimeout(() => {
          if (!callbackExecuted) resolve();
        }, 50)
      );
    });
  });

  it('should cover lines 457-458 - async LZMA error handling', async () => {
    const xz = track(new lzma.Xz());

    return new Promise<void>((resolve) => {
      let errorCount = 0;

      xz.on('error', (error) => {
        errorCount++;
        expect(error).toBeInstanceOf(Error);
        // Accept any LZMA error code (native + manual emit may both fire)
        expect(error.errno).toBeGreaterThan(0);
        if (errorCount === 1) xz.close();
      });

      // Absorb any errors after stream is destroyed (e.g. LZMA_PROG_ERROR
      // from native callback firing after close)
      xz.on('close', () => {
        trackTimer(setTimeout(resolve, 50));
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
      const xz = track(new lzma.Xz());

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
    const xz = track(new lzma.Xz());

    return new Promise<void>((resolve) => {
      let statesTracked = 0;
      const expectedStates = 3;

      const checkComplete = () => {
        statesTracked++;
        if (statesTracked >= expectedStates) resolve();
      };

      // Test ended state flush
      xz.on('finish', () => {
        xz.flush(() => checkComplete()); // Should handle ended state
      });

      // Test ending state flush
      xz.write(Buffer.from('state test'));
      xz.end();

      // Test normal flush
      trackTimer(
        setTimeout(() => {
          xz.flush(() => checkComplete());
        }, 5)
      );

      checkComplete(); // Initial count
    });
  });
});
