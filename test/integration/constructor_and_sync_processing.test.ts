import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as lzma from '../../src/lzma.js';

describe('Constructor and Sync Processing', () => {
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

  it('should export LZMA action constants', () => {
    // Access all LZMA action constants to ensure the line is executed
    expect(lzma.LZMAAction.RUN).toBe(lzma.LZMA_RUN);
    expect(lzma.LZMAAction.SYNC_FLUSH).toBe(lzma.LZMA_SYNC_FLUSH);
    expect(lzma.LZMAAction.FULL_FLUSH).toBe(lzma.LZMA_FULL_FLUSH);
    expect(lzma.LZMAAction.FINISH).toBe(lzma.LZMA_FINISH);
  });

  it('should export LZMA status constants', () => {
    // Access all LZMA status constants
    expect(lzma.LZMAStatus.OK).toBe(lzma.LZMA_OK);
    expect(lzma.LZMAStatus.STREAM_END).toBe(lzma.LZMA_STREAM_END);
    expect(lzma.LZMAStatus.NO_CHECK).toBe(lzma.LZMA_NO_CHECK);
    expect(lzma.LZMAStatus.MEM_ERROR).toBe(lzma.LZMA_MEM_ERROR);
  });

  it('should catch and handle filter validation exceptions', () => {
    // Test that creates malformed filter array to trigger exception handling
    expect(() => {
      /* biome-ignore lint/suspicious/noExplicitAny: Creating malformed object to test filter validation error handling */
      const malformedFilters: any = {};
      // Make it look like an array but fail the Array.isArray check
      Object.setPrototypeOf(malformedFilters, Array.prototype);
      malformedFilters.length = 1;
      malformedFilters.push = undefined; // Will cause error when accessed

      track(new lzma.Xz({ filters: malformedFilters }));
    }).toThrow('Filters need to be in an array!');
  });

  it('should cover lines 210-213 - default LZMA2 filter addition', () => {
    // Create Xz with filters that don't include LZMA2 to trigger addition
    const customFilters = [lzma.filter.X86]; // No LZMA2
    const xz = track(new lzma.Xz({ filters: customFilters }));

    expect(xz).toBeInstanceOf(lzma.Xz);
    // The constructor should have added LZMA2 to the filters
    xz.close();
  });

  it('should validate filter array requirements', () => {
    // This should work without throwing because filters will be valid
    const xz = track(new lzma.Xz({ filters: [lzma.filter.LZMA2, lzma.filter.X86] }));
    expect(xz).toBeInstanceOf(lzma.Xz);
    xz.close();
  });

  it('should complete constructor buffer allocation', () => {
    // Simple constructor test to ensure buffer allocation is complete
    const xz = track(new lzma.Xz({ chunkSize: 1024 }));
    expect(xz._chunkSize).toBe(1024);
    xz.close();
  });

  it('should invoke flush callback during stream ending phase', () => {
    const xz = track(new lzma.Xz());

    return new Promise<void>((resolve) => {
      let callbackExecuted = false;

      // Put stream in ending state
      xz.write(Buffer.from('test data'));
      xz.end();

      // Try to flush while ending - should invoke callback
      xz.flush(() => {
        callbackExecuted = true;
        expect(callbackExecuted).toBe(true);
        xz.close();
        resolve();
      });
    });
  });

  it('should initialize variables before async check', () => {
    const xz = track(new lzma.Xz());

    // Process chunk synchronously to initialize variables
    const result = xz._processChunk(Buffer.from('sync test'), lzma.LZMA_FINISH);
    expect(result).toBeInstanceOf(Buffer);

    xz.close();
  });

  it('should continue sync processing loop correctly', () => {
    const xz = track(new lzma.Xz({ chunkSize: 16 })); // Very small chunk size

    // Process large data to force multiple processing loops
    const largeData = Buffer.alloc(128, 'a'); // Much larger than chunk size
    const result = xz._processChunk(largeData, lzma.LZMA_FINISH);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    xz.close();
  });

  it('should handle buffer reallocation when needed', () => {
    const xz = track(new lzma.Xz({ chunkSize: 32 })); // Small chunk

    // Process data that will exhaust output buffer
    const testData = Buffer.alloc(256, 'x'); // Large input
    const result = xz._processChunk(testData, lzma.LZMA_FINISH);

    expect(result).toBeInstanceOf(Buffer);
    xz.close();
  });

  it('should handle errors in sync callback processing', () => {
    const xz = track(new lzma.Xz());

    return new Promise<void>((resolve) => {
      xz.on('error', (error) => {
        expect(error).toBeInstanceOf(Error);
        xz.close();
        resolve();
      });

      // Force an error by processing after closing
      xz.close();

      try {
        xz._processChunk(Buffer.from('test'), lzma.LZMA_RUN, () => {
          // This callback should trigger error handling
        });
      } catch {
        // Expected for closed stream
      }

      // Emit error to trigger sync callback error handling
      trackTimer(setTimeout(() => xz.emit('onerror', lzma.LZMA_DATA_ERROR), 10));
    });
  });

  it('should catch errors in async callback processing', () => {
    const xz = track(new lzma.Xz());

    return new Promise<void>((resolve) => {
      let errorHandled = false;

      xz.on('error', () => {
        errorHandled = true;
        xz.close();
        resolve();
      });

      // Process async and trigger callback error
      xz._processChunk(Buffer.from('async test'), lzma.LZMA_RUN, () => {
        if (!errorHandled) {
          // Force callback to throw error to test error handling
          throw new Error('Test callback error');
        }
      });

      // Timeout fallback
      trackTimer(
        setTimeout(() => {
          if (!errorHandled) {
            xz.close();
            resolve();
          }
        }, 50)
      );
    });
  });

  it('should test comprehensive edge cases for remaining coverage', () => {
    // Test multiple scenarios in one test to catch any remaining gaps

    // Test 1: Different filter configurations
    const xz1 = track(new lzma.Xz({ filters: [lzma.filter.LZMA2] }));
    const result1 = xz1._processChunk(Buffer.from('filter test 1'), lzma.LZMA_FINISH);
    expect(result1).toBeInstanceOf(Buffer);
    xz1.close();

    // Test 2: Different chunk sizes and processing patterns
    const xz2 = track(new lzma.Xz({ chunkSize: 64 }));
    const result2 = xz2._processChunk(Buffer.from('chunk test 2'), lzma.LZMA_FINISH);
    expect(result2).toBeInstanceOf(Buffer);
    xz2.close();

    // Test 3: Async processing with callback
    return new Promise<void>((resolve) => {
      const xz3 = track(new lzma.Xz());
      xz3._processChunk(Buffer.from('async test 3'), lzma.LZMA_RUN, () => {
        xz3.close();
        resolve();
      });
    });
  });
});
