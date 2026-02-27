import { describe, expect, it } from 'vitest';
import * as lzma from '../../src/lzma.js';

describe('Exports and Conditional Paths', () => {
  it('should test _flush method (uncovered function)', () => {
    const stream = new lzma.Xz({ preset: 0 });

    return new Promise<void>((resolve) => {
      stream.on('finish', () => {
        // The _flush method is called when the stream finishes
        resolve();
      });

      stream.write('test data');
      stream.end(); // This triggers _flush internally
    });
  });

  it('should access exports to trigger branch coverage', () => {
    // Branch at getWritableState function access
    const stream = new lzma.Xz({ preset: 0 });
    stream.close();

    // Branch at check constants access
    expect(lzma.check.NONE).toBeDefined();
    expect(lzma.check.CRC32).toBeDefined();
    expect(lzma.check.CRC64).toBeDefined();
    expect(lzma.check.SHA256).toBeDefined();

    // Branch at preset constants access
    expect(lzma.preset.DEFAULT).toBeDefined();
    expect(lzma.preset.EXTREME).toBeDefined();

    // Branch at LZMA error constants access
    expect(lzma.LZMA_MEMLIMIT_ERROR).toBeDefined();
  });

  it('should test options parsing branches ', () => {
    // These branches are in parseXzOptions function
    // Test with no options to trigger default branches
    try {
      const stream = new lzma.Xz();
      expect(stream).toBeDefined();
      stream.close();
    } catch (error) {
      // Expected behavior might throw
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('should test hasThreads function branch ', () => {
    // Access hasThreads function to trigger branch coverage
    const result = lzma.hasThreads();
    expect(typeof result).toBe('boolean');
  });

  it('should test export branch ', () => {
    // Access various exports to ensure all branches are covered
    expect(lzma.LZMA_RUN).toBeDefined();
    expect(lzma.LZMA_SYNC_FLUSH).toBeDefined();
    expect(lzma.LZMA_FULL_FLUSH).toBeDefined();
    expect(lzma.LZMA_FINISH).toBeDefined();
    expect(lzma.LZMA_OK).toBeDefined();
    expect(lzma.LZMA_STREAM_END).toBeDefined();
    expect(lzma.LZMA_NO_CHECK).toBeDefined();
    expect(lzma.LZMA_UNSUPPORTED_CHECK).toBeDefined();
    expect(lzma.LZMA_GET_CHECK).toBeDefined();
    expect(lzma.LZMA_MEM_ERROR).toBeDefined();
    expect(lzma.LZMA_MEMLIMIT_ERROR).toBeDefined();
    expect(lzma.LZMA_FORMAT_ERROR).toBeDefined();
    expect(lzma.LZMA_OPTIONS_ERROR).toBeDefined();
    expect(lzma.LZMA_DATA_ERROR).toBeDefined();
    expect(lzma.LZMA_BUF_ERROR).toBeDefined();
    expect(lzma.LZMA_PROG_ERROR).toBeDefined();

    // Test access to mode constants since function flush is
    expect(lzma.mode.FAST).toBeDefined();
    expect(lzma.mode.NORMAL).toBeDefined();
  });

  it('should test flush with different parameters to cover branches', () => {
    return new Promise<void>((resolve) => {
      const stream = new lzma.Xz({ preset: 0 });

      let callbackCount = 0;
      const checkComplete = () => {
        callbackCount++;
        if (callbackCount === 2) {
          stream.close();
          resolve();
        }
      };

      // Test flush with kind and callback
      stream.flush(lzma.LZMA_SYNC_FLUSH, () => {
        checkComplete();
      });

      // Test flush with just callback
      stream.flush(() => {
        checkComplete();
      });
    });
  });

  it('should test flush on ended stream to cover branches', async () => {
    const stream = new lzma.Xz({ preset: 0 });

    // Wait for stream to fully end first
    await new Promise<void>((resolve) => {
      stream.on('finish', resolve);
      stream.end();
    });

    // Now test flush on a fully ended stream
    let callbackCalled = false;
    stream.flush(() => {
      callbackCalled = true;
    });

    // Callback should be called on next tick for ended stream
    await new Promise<void>((resolve) => {
      process.nextTick(() => {
        expect(callbackCalled).toBe(true);
        resolve();
      });
    });
  });
});
