import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import * as xzStream from '../lib/lzma.js';
import * as helpers from './helpers.utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const ngb = require('node-gyp-build');
ngb(path.resolve(path.join(__dirname, '..')));
const nativeModulePath = ngb.path();

describe('Xz', () => {
  describe('should compress and decompress a string', () => {
    it('in sync mode, using #xzSync and #unxzSync', () => {
      const input = helpers.random(256);
      let output: Buffer;

      expect(() => {
        output = xzStream.xzSync(input);
      }).not.toThrow();

      expect(output).toBeTruthy();

      let original: Buffer;
      expect(() => {
        original = xzStream.unxzSync(output);
      }).not.toThrow();

      expect(original).toBeInstanceOf(Buffer);
      expect(original.toString()).toBe(input);
    });

    it('in async mode, using #xz and #unxz', () => {
      return new Promise<void>((resolve, reject) => {
        const buffer = helpers.random(256);

        xzStream.xz(buffer, (err, res) => {
          if (err) return reject(err);
          expect(err).toBeFalsy();

          xzStream.unxz(res as Buffer, (err, res) => {
            if (err) return reject(err);
            expect(err).toBeFalsy();
            expect(res).toBeInstanceOf(Buffer);
            expect(res?.toString()).toBe(buffer);
            resolve();
          });
        });
      });
    });

    it('in async mode using Promises, with #xzAsync and #unxzAsync', async () => {
      const input = helpers.random(256);

      const compressed = await xzStream.xzAsync(input);
      expect(compressed).toBeInstanceOf(Buffer);
      expect(compressed.length).toBeGreaterThan(0);

      const decompressed = await xzStream.unxzAsync(compressed);
      expect(decompressed).toBeInstanceOf(Buffer);
      expect(decompressed.toString()).toBe(input);
    });
  });

  describe('should compress a binary file (jpg)', () => {
    it('in sync mode', () => {
      const input = fs.readFileSync('test/data/HollywoodSign.jpg');
      let output: Buffer;

      expect(() => {
        output = xzStream.xzSync(input);
      }).not.toThrow();

      expect(output?.length).toBe(610980);
      // fs.writeFileSync('test/data/HollywoodSign.jpg.xz', output);
    });

    it('in async mode', () => {
      return new Promise<void>((resolve) => {
        const xz = new xzStream.Xz();
        const input = fs.createReadStream('test/data/HollywoodSign.jpg');

        const _compressor = input.pipe(xz);
        xz.on('data', () => {});
        xz.on('end', resolve);
      });
    });
  });

  describe('should compress and output', () => {
    it('in async mode', () => {
      return new Promise<void>((resolve, reject) => {
        const xz = new xzStream.Xz();
        const input = fs.createReadStream('test/data/HollywoodSign.jpg');
        const output = fs.createWriteStream('test/data/HollywoodSign.jpg.xz');

        output.on('finish', () => {
          const msg = helpers.checkOutputFile('test/data/HollywoodSign.jpg.xz', 610980);
          if (msg) {
            reject(new Error(msg));
          } else {
            resolve();
          }
        });

        input.pipe(xz).pipe(output);
      });
    });

    it('in threaded mode', () => {
      return new Promise<void>((resolve, reject) => {
        let expectedSize: number;

        if (xzStream.hasThreads()) {
          console.log('liblzma built with threads support.');
          expectedSize = 610988;
        } else {
          expectedSize = 610980;
          console.log('liblzma was built without thread support.');
        }

        const xz = new xzStream.Xz({ threads: 0 });
        const input = fs.createReadStream('test/data/HollywoodSign.jpg');
        const output = fs.createWriteStream('test/data/HollywoodSign.jpg.xz');

        output.on('finish', () => {
          const msg = helpers.checkOutputFile('test/data/HollywoodSign.jpg.xz', expectedSize);
          if (msg) {
            reject(new Error(msg));
          } else {
            resolve();
          }
        });

        input.pipe(xz).pipe(output);
      });
    });
  });
});

describe('UnXZ', () => {
  describe('should decompress', () => {
    it('in sync mode', () => {
      const input = fs.readFileSync('test/data/HollywoodSign.jpg.xz');
      let output: Buffer;

      expect(() => {
        output = xzStream.unxzSync(input);
      }).not.toThrow();

      expect(output?.length).toBe(616193);
    });

    it('in async mode', () => {
      return new Promise<void>((resolve) => {
        const unxz = new xzStream.Unxz();
        const input = fs.createReadStream('test/data/HollywoodSign.jpg.xz');

        const _decompressor = input.pipe(unxz);
        unxz.on('data', () => {});
        unxz.on('end', resolve);
      });
    });
  });

  describe('should decompress and output', () => {
    it('in async mode', () => {
      return new Promise<void>((resolve, reject) => {
        const unxz = new xzStream.Unxz();
        const input = fs.createReadStream('test/data/HollywoodSign.jpg.xz.orig');
        const output = fs.createWriteStream('test/data/HollywoodSign.jpg.unxz');

        output.on('finish', () => {
          const msg = helpers.checkOutputFile('test/data/HollywoodSign.jpg.unxz', 616193);
          if (msg) {
            reject(new Error(msg));
          } else {
            resolve();
          }
        });

        input.pipe(unxz).pipe(output);
      });
    });
  });

  describe('should accept LZMA_FILTER_X86 with generated node addon', () => {
    it('in sync mode, using #xzSync and #unxzSync', () => {
      const input = fs.readFileSync(nativeModulePath);
      let output: Buffer;

      expect(() => {
        output = xzStream.xzSync(input, { filters: [xzStream.filter.X86] });
      }).not.toThrow();

      expect(output).toBeTruthy();

      let original: Buffer;
      expect(() => {
        original = xzStream.unxzSync(output, { filters: [xzStream.filter.X86] });
      }).not.toThrow();

      expect(original).toBeInstanceOf(Buffer);

      if (!helpers.bufferEqual(original, input)) {
        throw new Error('Uncompressed different from original!');
      }
    });

    it('in async mode using promises, and compare output sizes', async () => {
      const buffer = fs.readFileSync(nativeModulePath);

      const promises = [
        new Promise<number>((resolve) => {
          xzStream.xz(buffer, (err, res) => {
            expect(err).toBeFalsy();
            resolve(res?.length);
          });
        }),
        new Promise<number>((resolve) => {
          xzStream.xz(buffer, { filters: [xzStream.filter.X86] }, (err, res) => {
            expect(err).toBeFalsy();
            resolve(res?.length);
          });
        }),
      ];

      const results = await Promise.all(promises);
      console.info(`Compressed size with X86 filter: ${results[1]}`);
      console.info(`Compressed size without X86 filter: ${results[0]}`);
    });
  });
});

describe('Factory functions and utilities', () => {
  it('should create Xz stream using createXz factory', () => {
    const stream = xzStream.createXz();
    expect(stream).toBeInstanceOf(xzStream.Xz);
  });

  it('should create Xz stream with options using createXz factory', () => {
    const stream = xzStream.createXz({ preset: xzStream.preset.EXTREME });
    expect(stream).toBeInstanceOf(xzStream.Xz);
  });

  it('should create Unxz stream using createUnxz factory', () => {
    const stream = xzStream.createUnxz();
    expect(stream).toBeInstanceOf(xzStream.Unxz);
  });

  it('should create Unxz stream with options using createUnxz factory', () => {
    const stream = xzStream.createUnxz({ check: xzStream.check.CRC64 });
    expect(stream).toBeInstanceOf(xzStream.Unxz);
  });

  it('should call close callback', () => {
    return new Promise<void>((resolve) => {
      const stream = new xzStream.Xz();
      stream.close(() => {
        resolve();
      });
    });
  });

  it('should handle promise rejection in xzAsync', async () => {
    // Test with invalid input to trigger error path
    await expect(
      xzStream.xzAsync('invalid data that should fail', { preset: 999 })
    ).rejects.toThrow();
  });

  it('should handle promise rejection in unxzAsync', async () => {
    // Test with invalid compressed data
    await expect(xzStream.unxzAsync(Buffer.from('invalid compressed data'))).rejects.toThrow();
  });

  it('should handle xz() with callback only (no options)', () => {
    return new Promise<void>((resolve) => {
      // This should hit lines 479-480: cb = optsOrCallback; opts = {};
      xzStream.xz('test data', (error, result) => {
        expect(error).toBeNull();
        expect(result).toBeInstanceOf(Buffer);
        resolve();
      });
    });
  });

  it('should handle xz() with options and callback', () => {
    return new Promise<void>((resolve) => {
      // This should hit lines 482-483: opts = optsOrCallback; cb = callback as CompressionCallback;
      xzStream.xz('test data', { preset: xzStream.preset.DEFAULT }, (error, result) => {
        expect(error).toBeNull();
        expect(result).toBeInstanceOf(Buffer);
        resolve();
      });
    });
  });

  it('should cover all xz function overload branches with type discrimination', () => {
    return new Promise<void>((resolve) => {
      let completedTests = 0;
      const totalTests = 6;

      const checkComplete = () => {
        completedTests++;
        if (completedTests === totalTests) {
          resolve();
        }
      };

      // Branch 1: xz(buffer, callback) - optsOrCallback is function
      xzStream.xz(Buffer.from('test1'), (err, result) => {
        expect(err).toBeNull();
        expect(result).toBeInstanceOf(Buffer);
        checkComplete();
      });

      // Branch 2: xz(string, callback) - optsOrCallback is function
      xzStream.xz('test2', (err, result) => {
        expect(err).toBeNull();
        expect(result).toBeInstanceOf(Buffer);
        checkComplete();
      });

      // Branch 3: xz(buffer, options, callback) - optsOrCallback is object
      xzStream.xz(Buffer.from('test3'), { preset: xzStream.preset.DEFAULT }, (err, result) => {
        expect(err).toBeNull();
        expect(result).toBeInstanceOf(Buffer);
        checkComplete();
      });

      // Branch 4: xz(string, options, callback) - optsOrCallback is object
      xzStream.xz('test4', { check: xzStream.check.CRC32 }, (err, result) => {
        expect(err).toBeNull();
        expect(result).toBeInstanceOf(Buffer);
        checkComplete();
      });

      // Force else branch: create an explicit options object (not function) for type discrimination
      // This should trigger: typeof optsOrCallback === 'function' -> false -> else branch
      const explicitOptions1 = {};
      const explicitCallback1 = (err, result) => {
        expect(err).toBeNull();
        expect(result).toBeInstanceOf(Buffer);
        checkComplete();
      };
      xzStream.xz('test5', explicitOptions1, explicitCallback1);

      // Another explicit test - create options object separately to ensure type checking
      // @ts-expect-error - preset.FAST may not exist in current implementation
      const explicitOptions2 = { preset: xzStream.preset.FAST };
      const explicitCallback2 = (err, result) => {
        expect(err).toBeNull();
        expect(result).toBeInstanceOf(Buffer);
        checkComplete();
      };
      xzStream.xz(Buffer.from('test6'), explicitOptions2, explicitCallback2);
    });
  });

  it('should handle unxz() with callback only (no options)', () => {
    return new Promise<void>((resolve) => {
      // First compress some data
      const testData = 'test data for unxz';
      xzStream.xz(testData, (err, compressed) => {
        expect(err).toBeNull();
        // Then decompress without options
        xzStream.unxz(compressed as Buffer, (error, result) => {
          expect(error).toBeNull();
          expect(result?.toString()).toBe(testData);
          resolve();
        });
      });
    });
  });

  it('should handle unxz() with options and callback', () => {
    return new Promise<void>((resolve) => {
      // First compress some data
      const testData = 'test data for unxz with options';
      xzStream.xz(testData, (err, compressed) => {
        expect(err).toBeNull();
        // Then decompress with options
        xzStream.unxz(compressed as Buffer, { check: xzStream.check.NONE }, (error, result) => {
          expect(error).toBeNull();
          expect(result?.toString()).toBe(testData);
          resolve();
        });
      });
    });
  });
});

describe('Error handling', () => {
  it('should handle invalid input (non-Buffer) in transform', () => {
    return new Promise<void>((resolve) => {
      const stream = new xzStream.Xz();
      // Force invalid input by bypassing TypeScript checks
      // biome-ignore lint/suspicious/noExplicitAny: Needed to test error handling
      (stream as any)._transform('invalid', 'utf8', (error: Error) => {
        expect(error.message).toBe('invalid input');
        resolve();
      });
    });
  });

  it('should handle closed stream error', () => {
    return new Promise<void>((resolve) => {
      const stream = new xzStream.Xz();
      // @ts-expect-error - accessing protected property for testing
      stream._closed = true;
      stream._transform(Buffer.from('test'), 'utf8', (error: Error) => {
        expect(error.message).toBe('lzma binding closed');
        resolve();
      });
    });
  });

  it('should handle invalid buffer type error', () => {
    expect(() => {
      // Force invalid type by bypassing checks
      // biome-ignore lint/suspicious/noExplicitAny: Needed to test error handling
      return xzStream.xzSync(123 as any);
    }).toThrow('Not a string or buffer');
  });

  it('should handle large buffer in sync mode to trigger multiple processing cycles', () => {
    // Use a large buffer that will require multiple processing cycles
    const largeData = Buffer.alloc(200000, 'A'); // 200KB of 'A' characters
    const result = xzStream.xzSync(largeData);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle error in sync mode processing', () => {
    expect(() => {
      const stream = new xzStream.Xz();
      // Close the stream first to trigger an error
      stream.close();
      // Try to process chunk on closed stream (should trigger lines 326-327, 337-338)
      stream._processChunk(Buffer.from('test'), 0);
    }).toThrow('Stream closed!');
  });

  it('should handle xzSync with options', () => {
    // This should cover line 484-485 in xzSync function
    const testData = 'test data for xzSync with options';
    const result = xzStream.xzSync(testData, { preset: xzStream.preset.DEFAULT });
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle xzSync without options', () => {
    const testData = 'test data for xzSync without options';
    // This should pass undefined to opts parameter in xzSync
    const result = xzStream.xzSync(testData);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle xzSync with explicit undefined options', () => {
    const testData = 'test data for xzSync with undefined';
    // This should explicitly test the undefined path
    const result = xzStream.xzSync(testData, undefined);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle unxzSync with options', () => {
    const testData = 'test data for unxzSync with options';
    // Compress with CRC32 check so we can decompress with it
    const compressed = xzStream.xzSync(testData, { check: xzStream.check.CRC32 });
    const result = xzStream.unxzSync(compressed, { check: xzStream.check.CRC32 });
    expect(result.toString()).toBe(testData);
  });
});

describe('Flush method edge cases', () => {
  it('should call flush with no arguments', () => {
    return new Promise<void>((resolve) => {
      const stream = new xzStream.Xz();
      stream.flush(() => {
        resolve();
      });
    });
  });

  it('should call flush with kind and callback', () => {
    return new Promise<void>((resolve) => {
      const stream = new xzStream.Xz();
      stream.flush(0, () => {
        resolve();
      });
    });
  });

  it('should handle flush when stream is ended', () => {
    return new Promise<void>((resolve) => {
      const stream = new xzStream.Xz();
      // Force ended state
      // biome-ignore lint/suspicious/noExplicitAny: Need to access Node.js internal _writableState for testing
      const ws = (stream as any)._writableState;
      ws.ended = true;

      stream.flush(() => {
        resolve();
      });
    });
  });

  it('should handle flush when stream is ending with callback', () => {
    return new Promise<void>((resolve) => {
      const stream = new xzStream.Xz();
      // Force ending state
      // biome-ignore lint/suspicious/noExplicitAny: Need to access Node.js internal _writableState for testing
      const ws = (stream as any)._writableState;
      ws.ending = true;

      // Set up the callback that should be called when 'end' is emitted
      stream.flush(() => {
        resolve();
      });

      // Emit end event to trigger the callback
      setImmediate(() => stream.emit('end'));
    });
  });

  afterAll(() => {
    // We completed our task, remove created files
    try {
      fs.unlinkSync('test/data/HollywoodSign.jpg.xz');
      fs.unlinkSync('test/data/HollywoodSign.jpg.unxz');
    } catch (_error) {
      // Files might not exist, ignore errors
    }
  });
});
