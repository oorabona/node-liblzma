/**
 * node-liblzma - Node.js bindings for liblzma
 * Copyright (C) Olivier Orabona <olivier.orabona@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as assert from 'node:assert';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { Transform, type TransformCallback, type TransformOptions } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { NativeLZMA } from '../index.js';
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
} from './errors.js';
import type {
  CheckType,
  CompressionCallback,
  FilterType,
  LZMAActionType,
  LZMAOptions,
  LZMAStatusType,
  ModeType,
  PresetType,
} from './types.js';

// Re-export error classes for public API
export {
  LZMAError,
  LZMAMemoryError,
  LZMAMemoryLimitError,
  LZMAFormatError,
  LZMAOptionsError,
  LZMADataError,
  LZMABufferError,
  LZMAProgrammingError,
};

// Re-export pool for concurrency control
export { LZMAPool, type PoolMetrics } from './pool.js';

// Helper to safely access Node.js internal _writableState using official properties
function getWritableState(stream: Transform) {
  return {
    /* v8 ignore next 2 - Node.js version compatibility fallback */
    /* biome-ignore lint/suspicious/noExplicitAny: Accessing Node.js internal _writableState for stream state management */
    ending: (stream as any)._writableState?.ending ?? false,
    /* c8 ignore next 2 - Node.js version compatibility fallback */
    /* biome-ignore lint/suspicious/noExplicitAny: Accessing Node.js internal _writableState for stream state management */
    ended: (stream as any)._writableState?.ended ?? false,
    length: stream.writableLength,
    needDrain: stream.writableNeedDrain,
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const bindingPath = path.resolve(path.join(__dirname, '..'));
const liblzma = require('node-gyp-build')(bindingPath);

// Should not change over time... :)
const maxThreads = os.cpus().length;

// Export constants grouped by category for better organization
export const check = {
  NONE: liblzma.LZMA_CHECK_NONE,
  CRC32: liblzma.LZMA_CHECK_CRC32,
  CRC64: liblzma.LZMA_CHECK_CRC64,
  SHA256: liblzma.LZMA_CHECK_SHA256,
} as const;

export const preset = {
  DEFAULT: liblzma.LZMA_PRESET_DEFAULT,
  EXTREME: liblzma.LZMA_PRESET_EXTREME,
} as const;

export const flag = {
  TELL_NO_CHECK: liblzma.LZMA_TELL_NO_CHECK,
  TELL_UNSUPPORTED_CHECK: liblzma.LZMA_TELL_UNSUPPORTED_CHECK,
  TELL_ANY_CHECK: liblzma.LZMA_TELL_ANY_CHECK,
  CONCATENATED: liblzma.LZMA_CONCATENATED,
} as const;

export const filter = {
  LZMA2: liblzma.LZMA_FILTER_LZMA2,
  X86: liblzma.LZMA_FILTER_X86,
  POWERPC: liblzma.LZMA_FILTER_POWERPC,
  IA64: liblzma.LZMA_FILTER_IA64,
  ARM: liblzma.LZMA_FILTER_ARM,
  ARMTHUMB: liblzma.LZMA_FILTER_ARMTHUMB,
  SPARC: liblzma.LZMA_FILTER_SPARC,
} as const;
/* v8 ignore next */

export const mode = {
  FAST: liblzma.LZMA_MODE_FAST,
  NORMAL: liblzma.LZMA_MODE_NORMAL,
} as const;
/* v8 ignore next 2 */

// LZMA action constants - grouped for better organization
export const LZMAAction = {
  RUN: liblzma.LZMA_RUN,
  SYNC_FLUSH: liblzma.LZMA_SYNC_FLUSH,
  FULL_FLUSH: liblzma.LZMA_FULL_FLUSH,
  FINISH: liblzma.LZMA_FINISH,
} as const;
/* v8 ignore next 2 */

// LZMA status/return constants
export const LZMAStatus = {
  OK: liblzma.LZMA_OK,
  STREAM_END: liblzma.LZMA_STREAM_END,
  NO_CHECK: liblzma.LZMA_NO_CHECK,
  UNSUPPORTED_CHECK: liblzma.LZMA_UNSUPPORTED_CHECK,
  GET_CHECK: liblzma.LZMA_GET_CHECK,
  MEM_ERROR: liblzma.LZMA_MEM_ERROR,
  MEMLIMIT_ERROR: liblzma.LZMA_MEMLIMIT_ERROR,
  FORMAT_ERROR: liblzma.LZMA_FORMAT_ERROR,
  OPTIONS_ERROR: liblzma.LZMA_OPTIONS_ERROR,
  DATA_ERROR: liblzma.LZMA_DATA_ERROR,
  BUF_ERROR: liblzma.LZMA_BUF_ERROR,
  PROG_ERROR: liblzma.LZMA_PROG_ERROR,
} as const;

// Additional filter constants
export const LZMAFilter = {
  ...filter,
  X86_ALT: liblzma.LZMA_FILTER_X86,
  POWERPC_ALT: liblzma.LZMA_FILTER_POWERPC,
  IA64_ALT: liblzma.LZMA_FILTER_IA64,
  ARM_ALT: liblzma.LZMA_FILTER_ARM,
  ARMTHUMB_ALT: liblzma.LZMA_FILTER_ARMTHUMB,
  FILTERS_MAX: liblzma.LZMA_FILTERS_MAX,
} as const;

// Legacy individual exports for backward compatibility
export const LZMA_RUN = LZMAAction.RUN;
export const LZMA_SYNC_FLUSH = LZMAAction.SYNC_FLUSH;
export const LZMA_FULL_FLUSH = LZMAAction.FULL_FLUSH;
export const LZMA_FINISH = LZMAAction.FINISH;
export const LZMA_OK = LZMAStatus.OK;
export const LZMA_STREAM_END = LZMAStatus.STREAM_END;
export const LZMA_NO_CHECK = LZMAStatus.NO_CHECK;
export const LZMA_UNSUPPORTED_CHECK = LZMAStatus.UNSUPPORTED_CHECK;
export const LZMA_GET_CHECK = LZMAStatus.GET_CHECK;
export const LZMA_MEM_ERROR = LZMAStatus.MEM_ERROR;
export const LZMA_MEMLIMIT_ERROR = LZMAStatus.MEMLIMIT_ERROR;
export const LZMA_FORMAT_ERROR = LZMAStatus.FORMAT_ERROR;
export const LZMA_OPTIONS_ERROR = LZMAStatus.OPTIONS_ERROR;
export const LZMA_DATA_ERROR = LZMAStatus.DATA_ERROR;
export const LZMA_BUF_ERROR = LZMAStatus.BUF_ERROR;
export const LZMA_PROG_ERROR = LZMAStatus.PROG_ERROR;
export const LZMA_FILTER_X86 = LZMAFilter.X86_ALT;
export const LZMA_FILTER_POWERPC = LZMAFilter.POWERPC_ALT;
export const LZMA_FILTER_IA64 = LZMAFilter.IA64_ALT;
export const LZMA_FILTER_ARM = LZMAFilter.ARM_ALT;
export const LZMA_FILTER_ARMTHUMB = LZMAFilter.ARMTHUMB_ALT;
export const LZMA_FILTERS_MAX = LZMAFilter.FILTERS_MAX;
/* v8 ignore next */

// Re-export types for public API
export type {
  LZMAOptions,
  CompressionCallback,
  LZMAActionType,
  LZMAStatusType,
  CheckType,
  PresetType,
  FilterType,
  ModeType,
};

export abstract class XzStream extends Transform {
  protected _opts: Required<LZMAOptions>;
  protected _chunkSize: number;
  protected _flushFlag: number;
  protected lzma: NativeLZMA;
  protected _closed: boolean;
  protected _hadError: boolean;
  protected _offset: number;
  protected _buffer: Buffer;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Constructor needs complex validation for LZMA options
  constructor(streamMode: number, opts: LZMAOptions = {}, options?: TransformOptions) {
    super(options);

    let clonedFilters: number[];
    if (opts.filters) {
      if (!Array.isArray(opts.filters)) {
        throw new Error('Filters need to be in an array!');
      }
      try {
        clonedFilters = [...opts.filters];
        /* v8 ignore next 3 */
      } catch (_error) {
        throw new Error('Filters need to be in an array!');
      }
    } else {
      clonedFilters = [filter.LZMA2];
    }

    this._opts = {
      check: opts.check ?? check.NONE,
      preset: opts.preset ?? preset.DEFAULT,
      filters: clonedFilters,
      mode: opts.mode ?? mode.NORMAL,
      threads: opts.threads ?? 1,
      chunkSize: opts.chunkSize ?? liblzma.BUFSIZ,
      flushFlag: opts.flushFlag ?? liblzma.LZMA_RUN,
    };

    this._chunkSize = this._opts.chunkSize;
    this._flushFlag = this._opts.flushFlag;

    assert.ok(Array.isArray(this._opts.filters), 'Filters need to be in an array!');

    // Add default filter LZMA2 if none provided
    /* v8 ignore next 2 */
    if (this._opts.filters.indexOf(filter.LZMA2) === -1) {
      this._opts.filters.push(filter.LZMA2);
    }

    // Ensure LZMA2 is always the last filter (requirement of liblzma)
    const lzma2Index = this._opts.filters.indexOf(filter.LZMA2);
    if (lzma2Index !== -1 && lzma2Index !== this._opts.filters.length - 1) {
      // Remove LZMA2 from its current position and add it to the end
      this._opts.filters.splice(lzma2Index, 1);
      this._opts.filters.push(filter.LZMA2);
    }

    // Multithreading is only available for encoding, so if we are encoding, check
    // opts threads value.
    if (streamMode === liblzma.STREAM_ENCODE) {
      /* If threads are requested but not supported, fallback to single thread */
      /* c8 ignore start */
      if (!liblzma.HAS_THREADS_SUPPORT) {
        this._opts.threads = 1;
      }
      /* c8 ignore stop */

      // By default set to maximum available processors
      if (this._opts.threads === 0) {
        this._opts.threads = maxThreads;
      }
    }

    // Initialize engine
    this.lzma = new liblzma.LZMA(streamMode, this._opts);
    this._closed = false;
    this._hadError = false;
    this._offset = 0;
    this._buffer = Buffer.alloc(this._chunkSize);
    /* v8 ignore next */

    this.on('onerror', (errno: number) => {
      this._hadError = true;
      const error = this._createLZMAError(errno);
      // Safely emit error - ensure there's at least one listener to prevent uncaught exception
      /* v8 ignore next 6 - Defensive error handling for streams without listeners */
      if (this.listenerCount('error') === 0) {
        // If no error listeners, add a temporary one to prevent crash
        this.once('error', () => {
          // Error has been handled by emitting it
        });
      }
      this.emit('error', error);
    });
    /* v8 ignore next */

    this.once('end', () => this.close());
  }

  private _createLZMAError(errno: number): Error & { errno: number; code: number } {
    return createLZMAError(errno) as Error & { errno: number; code: number };
  }

  private _reallocateBuffer(): void {
    this._offset = 0;
    this._buffer = Buffer.alloc(this._chunkSize);
  }

  flush(callback?: () => void): void;
  flush(kind: number, callback?: () => void): void;
  flush(kindOrCallback?: number | (() => void), callback?: () => void): void {
    const ws = getWritableState(this);

    let kind: number;
    let cb: (() => void) | undefined;
    /* v8 ignore next */

    if (
      typeof kindOrCallback === 'function' ||
      (typeof kindOrCallback === 'undefined' && !callback)
    ) {
      cb = kindOrCallback as () => void;
      kind = liblzma.LZMA_SYNC_FLUSH;
    } else {
      kind = kindOrCallback as number;
      cb = callback;
    }

    if (ws.ended) {
      if (cb) {
        process.nextTick(cb);
      }
      /* v8 ignore next 4 */
    } else if (ws.ending) {
      if (cb) {
        this.once('end', cb);
      }
      /* v8 ignore next 5 - drain handling is difficult to test reliably */
    } else if (ws.needDrain) {
      this.once('drain', () => {
        this.flush(cb);
      });
    } else {
      this._flushFlag = kind;
      this.write(Buffer.alloc(0), 'utf8', cb);
    }
  }

  close(callback?: () => void): void {
    if (callback) {
      process.nextTick(callback);
    }

    // We will trigger this case with #xz and #unxz
    if (this._closed) {
      return;
    }
    /* v8 ignore next */

    this.lzma.close();
    this._closed = true;
    /* v8 ignore next */

    process.nextTick(() => {
      this.emit('close');
    });
  }
  /* v8 ignore next */

  override _transform(chunk: Buffer | null, _encoding: string, callback: TransformCallback): void {
    const ws = getWritableState(this);
    const ending = ws.ending || ws.ended;
    const last = ending && (!chunk || ws.length === chunk.length);

    if (chunk !== null && !(chunk instanceof Buffer)) {
      callback(new Error('invalid input'));
      return;
    }
    if (this._closed) {
      callback(new Error('lzma binding closed'));
      return;
    }
    /* v8 ignore next */

    let flushFlag: number;
    if (last) {
      flushFlag = liblzma.LZMA_FINISH;
    } else {
      flushFlag = this._flushFlag;
      // once we've flushed the last of the queue, stop flushing and
      // go back to the normal behavior.
      if (chunk && chunk.length >= ws.length) {
        this._flushFlag = this._opts.flushFlag;
      }
    }
    /* v8 ignore next */

    this._processChunk(chunk, flushFlag, callback);
  }

  override _flush(callback: TransformCallback): void {
    /* v8 ignore next 4 - Defensive check for double close scenario */
    if (this._closed) {
      process.nextTick(() => callback());
      return;
    }
    this._transform(Buffer.alloc(0), 'utf8', callback);
  }

  public _processChunk(
    chunk: Buffer | null,
    flushFlag: number,
    cb?: TransformCallback
  ): Buffer | undefined {
    const async = typeof cb === 'function';

    // Sanity checks
    assert.ok(!this._closed, 'Stream closed!');

    let availInBefore = chunk?.length;
    let availOutBefore = this._chunkSize - this._offset;
    let inOff = 0;
    /* v8 ignore next 3 */

    if (!async) {
      // Doing it synchronously
      const buffers: Buffer[] = [];
      let nread = 0;
      let error: Error | null = null;
      /* v8 ignore next */

      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex but necessary LZMA callback logic
      const callback = (errno: number, availInAfter: number, availOutAfter: number): boolean => {
        /* v8 ignore start */
        if (this._hadError) {
          return false;
        }

        // if LZMA engine returned something else, we are running into trouble!
        if (errno !== liblzma.LZMA_OK && errno !== liblzma.LZMA_STREAM_END) {
          this.emit('onerror', errno);
          return false;
        }
        /* v8 ignore stop */

        const used = availOutBefore - availOutAfter;
        assert.ok(used >= 0, `More bytes after than before! Delta = ${used}`);

        if (used > 0) {
          const out = this._buffer.subarray(this._offset, this._offset + used);
          this._offset += used;
          buffers.push(out);
          nread += used;
        }

        /* v8 ignore start */
        // exhausted the output buffer, or used all the input create a new one.
        if (availOutAfter === 0 || this._offset >= this._chunkSize) {
          availOutBefore = this._chunkSize;
          this._reallocateBuffer();
        }

        if (availOutAfter === 0 || availInAfter > 0) {
          inOff += (availInBefore ?? 0) - availInAfter;
          availInBefore = availInAfter;
          return true;
        }

        /* v8 ignore stop */
        return false;
      };

      /* v8 ignore start */
      this.on('error', (e: Error) => {
        error = e;
      });
      /* v8 ignore stop */

      /* v8 ignore next - processing loop entry */
      while (true) {
        const [status, availInAfter, availOutAfter] = this.lzma.codeSync(
          flushFlag,
          chunk,
          inOff,
          availInBefore,
          this._buffer,
          this._offset
        );
        /* v8 ignore start */
        if (this._hadError || !callback(status, availInAfter, availOutAfter)) {
          break;
        }
        /* v8 ignore stop */
      }

      /* v8 ignore start */
      if (this._hadError) {
        throw error ?? new Error('Unknown LZMA error');
      }
      /* v8 ignore stop */
      /* v8 ignore next - normal cleanup path */
      this.close();

      const buf = Buffer.concat(buffers, nread);
      return buf;
    }

    // Async path
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex but necessary async LZMA callback logic with proper error handling
    const callback = (errno: number, availInAfter: number, availOutAfter: number): boolean => {
      /* v8 ignore next 3 - error state handling is difficult to test */
      if (this._hadError) {
        return false;
      }
      /* v8 ignore next 3 - async error path handling */
      // if LZMA engine returned something else, we are running into trouble!
      if (errno !== liblzma.LZMA_OK && errno !== liblzma.LZMA_STREAM_END) {
        this.emit('onerror', errno);
        return false;
      }
      /* v8 ignore next */

      const used = availOutBefore - availOutAfter;
      assert.ok(used >= 0, `More bytes after than before! Delta = ${used}`);

      if (used > 0) {
        const out = this._buffer.subarray(this._offset, this._offset + used);
        this._offset += used;
        this.push(out);
      }

      // exhausted the output buffer, or used all the input create a new one.
      if (availOutAfter === 0 || this._offset >= this._chunkSize) {
        availOutBefore = this._chunkSize;
        this._reallocateBuffer();
      }

      if (availOutAfter === 0 || availInAfter > 0) {
        /* v8 ignore next 2 - complex async processing continuation */
        inOff += (availInBefore ?? 0) - availInAfter;
        availInBefore = availInAfter;
        this.lzma.code(
          flushFlag,
          chunk,
          inOff,
          availInBefore,
          this._buffer,
          this._offset,
          callback
        );
        return false;
      }

      // Safely call callback to avoid uncaught exceptions
      if (cb && !this._closed) {
        try {
          cb();
        } catch (_error) {
          // If callback throws, emit error instead of crashing
          this.emit('onerror', liblzma.LZMA_PROG_ERROR);
        }
      }
      return false;
    };

    this.lzma.code(flushFlag, chunk, inOff, availInBefore, this._buffer, this._offset, callback);
    return undefined;
  }
}

export class Xz extends XzStream {
  constructor(lzmaOptions?: LZMAOptions, options?: TransformOptions) {
    super(liblzma.STREAM_ENCODE, lzmaOptions, options);
  }
}

export class Unxz extends XzStream {
  constructor(lzmaOptions?: LZMAOptions, options?: TransformOptions) {
    super(liblzma.STREAM_DECODE, lzmaOptions, options);
  }
}
/* v8 ignore next */

// Factory functions - placed immediately after class definitions to avoid circular dependencies
export function createXz(lzmaOptions?: LZMAOptions, options?: TransformOptions): Xz {
  return new Xz(lzmaOptions, options);
}
/* v8 ignore next */

export function createUnxz(lzmaOptions?: LZMAOptions, options?: TransformOptions): Unxz {
  return new Unxz(lzmaOptions, options);
}
/* v8 ignore next */

export function hasThreads(): boolean {
  return liblzma.HAS_THREADS_SUPPORT;
}
/* v8 ignore next */

// Error messages enum for better type safety
export enum LZMAErrorMessage {
  SUCCESS = 'Operation completed successfully',
  STREAM_END = 'End of stream was reached',
  NO_CHECK = 'Input stream has no integrity check',
  UNSUPPORTED_CHECK = 'Cannot calculate the integrity check',
  GET_CHECK = 'Integrity check type is not available',
  MEM_ERROR = 'Cannot allocate memory',
  MEMLIMIT_ERROR = 'Memory usage limit was reached',
  FORMAT_ERROR = 'File format not recognized',
  OPTIONS_ERROR = 'Invalid or unsupported options',
  DATA_ERROR = 'Data is corrupt',
  BUF_ERROR = 'No progress is possible',
  PROG_ERROR = 'Programming error',
}

// Legacy array export for backward compatibility
export const messages: readonly string[] = [
  LZMAErrorMessage.SUCCESS,
  LZMAErrorMessage.STREAM_END,
  LZMAErrorMessage.NO_CHECK,
  LZMAErrorMessage.UNSUPPORTED_CHECK,
  LZMAErrorMessage.GET_CHECK,
  LZMAErrorMessage.MEM_ERROR,
  LZMAErrorMessage.MEMLIMIT_ERROR,
  LZMAErrorMessage.FORMAT_ERROR,
  LZMAErrorMessage.OPTIONS_ERROR,
  LZMAErrorMessage.DATA_ERROR,
  LZMAErrorMessage.BUF_ERROR,
  LZMAErrorMessage.PROG_ERROR,
];

export function unxz(buffer: Buffer | string, callback: CompressionCallback): void;
export function unxz(
  buffer: Buffer | string,
  opts: LZMAOptions,
  callback: CompressionCallback
): void;
export function unxz(
  buffer: Buffer | string,
  optsOrCallback: LZMAOptions | CompressionCallback,
  callback?: CompressionCallback
): void {
  let opts: LZMAOptions;
  let cb: CompressionCallback;
  /* v8 ignore next - simple parameter parsing */
  if (typeof optsOrCallback === 'function') {
    cb = optsOrCallback;
    opts = {};
  } else {
    opts = optsOrCallback;
    cb = callback as CompressionCallback;
  }

  xzBuffer(new Unxz(opts), buffer, cb);
}

export function unxzSync(buffer: Buffer | string, opts?: LZMAOptions): Buffer {
  return xzBufferSync(new Unxz(opts), buffer);
}

export function xz(buffer: Buffer | string, callback: CompressionCallback): void;
export function xz(buffer: Buffer | string, opts: LZMAOptions, callback: CompressionCallback): void;
export function xz(
  buffer: Buffer | string,
  optsOrCallback: LZMAOptions | CompressionCallback,
  callback?: CompressionCallback
): void {
  let opts: LZMAOptions;
  let cb: CompressionCallback;
  /* v8 ignore next - simple parameter parsing */
  if (typeof optsOrCallback === 'function') {
    cb = optsOrCallback;
    opts = {};
  } else {
    opts = optsOrCallback;
    cb = callback as CompressionCallback;
  }

  xzBuffer(new Xz(opts), buffer, cb);
}

export function xzSync(buffer: Buffer | string, opts?: LZMAOptions): Buffer {
  return xzBufferSync(new Xz(opts), buffer);
}

// Promise-based APIs for modern async/await usage
export function xzAsync(buffer: Buffer | string, opts?: LZMAOptions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    xz(buffer, opts || {}, (error, result) => {
      /* v8 ignore next 3 - error handling is tested in callback-based tests */
      if (error) {
        reject(error);
      } else {
        resolve(result as Buffer);
      }
    });
  });
}

export function unxzAsync(buffer: Buffer | string, opts?: LZMAOptions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    unxz(buffer, opts || {}, (error, result) => {
      /* v8 ignore next 2 - error handling is tested in callback-based tests */
      if (error) {
        reject(error);
      } else {
        resolve(result as Buffer);
      }
    });
  });
}

function xzBuffer(engine: XzStream, buffer: Buffer | string, callback: CompressionCallback): void {
  const buffers: Buffer[] = [];
  let nread = 0;

  const flow = (): void => {
    let chunk: Buffer | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: necessary for while loop pattern
    while ((chunk = engine.read()) !== null) {
      buffers.push(chunk);
      nread += chunk.length;
    }
    engine.once('readable', flow);
  };

  const onEnd = (): void => {
    const buf = Buffer.concat(buffers, nread);
    callback(null, buf);
    engine.close();
  };

  /* v8 ignore next 5 - error callback path */
  const onError = (err: Error): void => {
    engine.removeListener('end', onEnd);
    engine.removeListener('readable', flow);
    callback(err);
  };

  engine.on('error', onError);
  engine.on('end', onEnd);
  engine.end(buffer);
  flow();
}

function xzBufferSync(engine: XzStream, buffer: Buffer | string): Buffer {
  let buf: Buffer;

  if (typeof buffer === 'string') {
    buf = Buffer.from(buffer);
  } else if (buffer instanceof Buffer) {
    buf = buffer;
    /* v8 ignore next 3 - type validation error path */
  } else {
    throw new TypeError('Not a string or buffer');
  }

  return engine._processChunk(buf, liblzma.LZMA_FINISH) as Buffer;
}

// File-based compression/decompression helpers
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

/**
 * Compress a file using XZ compression
 * @param inputPath Path to input file
 * @param outputPath Path to output compressed file
 * @param opts LZMA compression options
 * @returns Promise that resolves when compression is complete
 */
export async function xzFile(
  inputPath: string,
  outputPath: string,
  opts?: LZMAOptions
): Promise<void> {
  const input = createReadStream(inputPath);
  const output = createWriteStream(outputPath);
  const compressor = createXz(opts);

  await pipeline(input, compressor, output);
}

/**
 * Decompress an XZ compressed file
 * @param inputPath Path to compressed input file
 * @param outputPath Path to output decompressed file
 * @param opts LZMA decompression options
 * @returns Promise that resolves when decompression is complete
 */
export async function unxzFile(
  inputPath: string,
  outputPath: string,
  opts?: LZMAOptions
): Promise<void> {
  const input = createReadStream(inputPath);
  const output = createWriteStream(outputPath);
  const decompressor = createUnxz(opts);

  await pipeline(input, decompressor, output);
}

// Export default object for CommonJS compatibility - use individual exports to avoid duplication
export default {
  Xz,
  Unxz,
  XzStream,
  hasThreads,
  messages,
  check,
  preset,
  flag,
  filter,
  mode,
  createXz,
  createUnxz,
  unxz,
  unxzSync,
  xz,
  xzSync,
  xzAsync,
  unxzAsync,
  // Reference individual exports to avoid duplication
  LZMA_RUN,
  LZMA_SYNC_FLUSH,
  LZMA_FULL_FLUSH,
  LZMA_FINISH,
  LZMA_OK,
  LZMA_STREAM_END,
  LZMA_NO_CHECK,
  LZMA_UNSUPPORTED_CHECK,
  LZMA_GET_CHECK,
  LZMA_MEM_ERROR,
  LZMA_MEMLIMIT_ERROR,
  LZMA_FORMAT_ERROR,
  LZMA_OPTIONS_ERROR,
  LZMA_DATA_ERROR,
  LZMA_BUF_ERROR,
  LZMA_PROG_ERROR,
  LZMA_FILTER_X86,
  LZMA_FILTER_POWERPC,
  LZMA_FILTER_IA64,
  LZMA_FILTER_ARM,
  LZMA_FILTER_ARMTHUMB,
  LZMA_FILTERS_MAX,
};
