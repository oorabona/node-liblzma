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
  ProgressInfo,
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

// F-009: Type for internal Node.js stream state (no public API equivalent for _writableState.ended)
// Using internal API is intentional - writableFinished has different semantics than _writableState.ended
interface WritableState {
  ending: boolean;
  ended: boolean;
  length: number;
  needDrain: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const bindingPath = path.resolve(path.join(__dirname, '..'));
const liblzma = require('node-gyp-build')(bindingPath);

// Should not change over time... :)
const maxThreads = os.cpus().length;

/**
 * Integrity check types for XZ streams.
 * Use CRC64 for best balance of speed and error detection.
 * @example
 * ```ts
 * const compressor = createXz({ check: check.CRC64 });
 * ```
 */
export const check = {
  NONE: liblzma.LZMA_CHECK_NONE,
  CRC32: liblzma.LZMA_CHECK_CRC32,
  CRC64: liblzma.LZMA_CHECK_CRC64,
  SHA256: liblzma.LZMA_CHECK_SHA256,
} as const;

/**
 * Compression preset flags.
 * Can be combined with preset level using bitwise OR.
 * @example
 * ```ts
 * const compressor = createXz({ preset: 6 | preset.EXTREME });
 * ```
 */
export const preset = {
  /** Default compression level (6) */
  DEFAULT: liblzma.LZMA_PRESET_DEFAULT,
  /** Extreme mode flag - slower but better compression */
  EXTREME: liblzma.LZMA_PRESET_EXTREME,
} as const;

/**
 * Decoder flags for controlling decompression behavior.
 * @example
 * ```ts
 * const decompressor = createUnxz({ flushFlag: flag.CONCATENATED });
 * ```
 */
export const flag = {
  /** Tell decoder if input has no integrity check */
  TELL_NO_CHECK: liblzma.LZMA_TELL_NO_CHECK,
  /** Tell decoder if integrity check is unsupported */
  TELL_UNSUPPORTED_CHECK: liblzma.LZMA_TELL_UNSUPPORTED_CHECK,
  /** Tell decoder about any integrity check type */
  TELL_ANY_CHECK: liblzma.LZMA_TELL_ANY_CHECK,
  /** Allow concatenated XZ streams */
  CONCATENATED: liblzma.LZMA_CONCATENATED,
} as const;

/**
 * Compression filters for preprocessing data before LZMA2.
 * BCJ filters improve compression for executable code.
 * @example
 * ```ts
 * // Compress x86 executable with BCJ filter
 * const compressor = createXz({ filters: [filter.X86, filter.LZMA2] });
 * ```
 */
export const filter = {
  /** LZMA2 compression filter (required, must be last) */
  LZMA2: liblzma.LZMA_FILTER_LZMA2,
  /** BCJ filter for x86 executables */
  X86: liblzma.LZMA_FILTER_X86,
  /** BCJ filter for PowerPC executables */
  POWERPC: liblzma.LZMA_FILTER_POWERPC,
  /** BCJ filter for IA-64 executables */
  IA64: liblzma.LZMA_FILTER_IA64,
  /** BCJ filter for ARM executables */
  ARM: liblzma.LZMA_FILTER_ARM,
  /** BCJ filter for ARM-Thumb executables */
  ARMTHUMB: liblzma.LZMA_FILTER_ARMTHUMB,
  /** BCJ filter for SPARC executables */
  SPARC: liblzma.LZMA_FILTER_SPARC,
} as const;
/* v8 ignore next */

/**
 * Compression mode selection.
 * FAST uses less memory, NORMAL provides better compression.
 */
export const mode = {
  /** Fast compression mode - less memory, faster */
  FAST: liblzma.LZMA_MODE_FAST,
  /** Normal compression mode - better ratio */
  NORMAL: liblzma.LZMA_MODE_NORMAL,
} as const;
/* v8 ignore next 2 */

/**
 * LZMA stream action constants.
 * Control how the encoder/decoder processes input.
 */
export const LZMAAction = {
  /** Normal processing - continue encoding/decoding */
  RUN: liblzma.LZMA_RUN,
  /** Flush pending output synchronously */
  SYNC_FLUSH: liblzma.LZMA_SYNC_FLUSH,
  /** Flush and reset encoder state */
  FULL_FLUSH: liblzma.LZMA_FULL_FLUSH,
  /** Finish the stream - no more input */
  FINISH: liblzma.LZMA_FINISH,
} as const;
/* v8 ignore next 2 */

/**
 * LZMA operation status/return codes.
 * Used to indicate the result of encoding/decoding operations.
 */
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
  ProgressInfo,
};

/**
 * Abstract base class for XZ compression/decompression streams.
 * Extends Node.js Transform stream with LZMA2 encoding/decoding.
 *
 * @example
 * ```ts
 * // Use Xz or Unxz classes instead of XzStream directly
 * const compressor = new Xz({ preset: 6 });
 * readStream.pipe(compressor).pipe(writeStream);
 * ```
 *
 * Emits `progress` event after each chunk with `{bytesRead, bytesWritten}` info.
 */
export abstract class XzStream extends Transform {
  protected _opts: Required<LZMAOptions>;
  protected _chunkSize: number;
  protected _flushFlag: number;
  protected lzma: NativeLZMA;
  protected _closed: boolean;
  protected _hadError: boolean;
  protected _offset: number;
  protected _buffer: Buffer;

  /** Total bytes read from input */
  protected _bytesRead: number;
  /** Total bytes written to output */
  protected _bytesWritten: number;

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
    this._bytesRead = 0;
    this._bytesWritten = 0;
    /* v8 ignore next */

    // F-007: Let errors propagate naturally (removed defensive listener anti-pattern)
    this.on('onerror', (errno: number) => {
      this._hadError = true;
      const error = this._createLZMAError(errno);
      this.emit('error', error);
    });
    /* v8 ignore next */

    this.once('end', () => this.close());
  }

  private _createLZMAError(errno: number): Error & { errno: number; code: number } {
    return createLZMAError(errno) as Error & { errno: number; code: number };
  }

  /** Get total bytes read from input so far */
  get bytesRead(): number {
    return this._bytesRead;
  }

  /** Get total bytes written to output so far */
  get bytesWritten(): number {
    return this._bytesWritten;
  }

  /**
   * Emit a progress event with current bytesRead and bytesWritten
   */
  protected _emitProgress(): void {
    const info: ProgressInfo = {
      bytesRead: this._bytesRead,
      bytesWritten: this._bytesWritten,
    };
    this.emit('progress', info);
  }

  private _reallocateBuffer(): void {
    this._offset = 0;
    this._buffer = Buffer.alloc(this._chunkSize);
  }

  flush(callback?: () => void): void;
  flush(kind: number, callback?: () => void): void;
  flush(kindOrCallback?: number | (() => void), callback?: () => void): void {
    // F-009: Access internal _writableState with type safety (no public API equivalent for .ended)
    const ws = (this as unknown as { _writableState: WritableState })._writableState;

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
    // F-009: Access internal _writableState with type safety (no public API equivalent for .ended)
    const ws = (this as unknown as { _writableState: WritableState })._writableState;
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

    // Track bytes read from input
    if (chunk) {
      this._bytesRead += chunk.length;
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

      // F-012: Use try-finally to ensure close() runs even on error
      try {
        /* v8 ignore start */
        if (this._hadError) {
          throw error ?? new Error('Unknown LZMA error');
        }
        /* v8 ignore stop */

        const buf = Buffer.concat(buffers, nread);
        return buf;
      } finally {
        /* v8 ignore next - cleanup path */
        this.close();
      }
    }

    // Async path
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex but necessary async LZMA callback logic with proper error handling
    const callback = (errno: number, availInAfter: number, availOutAfter: number): boolean => {
      /* v8 ignore next 3 - error state handling is difficult to test */
      if (this._hadError) {
        return false;
      }
      /* v8 ignore next 5 - async error path handling */
      // F-003: If LZMA engine returned an error, emit onerror event (matches sync path at line 438)
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
        this._bytesWritten += used;
        this.push(out);
        this._emitProgress();
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

/**
 * XZ compression stream.
 * Compresses data using LZMA2 algorithm.
 *
 * @example
 * ```ts
 * const compressor = new Xz({ preset: 6 });
 * input.pipe(compressor).pipe(output);
 * ```
 */
export class Xz extends XzStream {
  constructor(lzmaOptions?: LZMAOptions, options?: TransformOptions) {
    super(liblzma.STREAM_ENCODE, lzmaOptions, options);
  }
}

/**
 * XZ decompression stream.
 * Decompresses data compressed with XZ/LZMA2.
 *
 * @example
 * ```ts
 * const decompressor = new Unxz();
 * compressedInput.pipe(decompressor).pipe(output);
 * ```
 */
export class Unxz extends XzStream {
  constructor(lzmaOptions?: LZMAOptions, options?: TransformOptions) {
    super(liblzma.STREAM_DECODE, lzmaOptions, options);
  }
}
/* v8 ignore next */

/**
 * Create a new XZ compression stream.
 * @param lzmaOptions - LZMA compression options
 * @param options - Node.js Transform stream options
 * @returns New Xz compression stream
 *
 * @example
 * ```ts
 * const compressor = createXz({ preset: 9 });
 * ```
 */
export function createXz(lzmaOptions?: LZMAOptions, options?: TransformOptions): Xz {
  return new Xz(lzmaOptions, options);
}
/* v8 ignore next */

/**
 * Create a new XZ decompression stream.
 * @param lzmaOptions - LZMA decompression options
 * @param options - Node.js Transform stream options
 * @returns New Unxz decompression stream
 *
 * @example
 * ```ts
 * const decompressor = createUnxz();
 * ```
 */
export function createUnxz(lzmaOptions?: LZMAOptions, options?: TransformOptions): Unxz {
  return new Unxz(lzmaOptions, options);
}
/* v8 ignore next */

/**
 * Check if liblzma was built with threading support.
 * @returns true if multi-threaded compression is available
 */
export function hasThreads(): boolean {
  return liblzma.HAS_THREADS_SUPPORT;
}
/* v8 ignore next */

/**
 * Human-readable error messages for LZMA status codes.
 */
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

/**
 * Array of error messages indexed by LZMA status code.
 * @deprecated Use LZMAErrorMessage enum instead
 */
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

/**
 * Decompress a buffer asynchronously using callback.
 * @param buffer - Compressed data to decompress
 * @param callback - Callback with error or decompressed data
 *
 * @example
 * ```ts
 * unxz(compressedBuffer, (err, result) => {
 *   if (err) throw err;
 *   console.log(result.toString());
 * });
 * ```
 */
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

/**
 * Decompress a buffer synchronously.
 * @param buffer - Compressed data to decompress
 * @param opts - LZMA decompression options
 * @returns Decompressed data buffer
 *
 * @example
 * ```ts
 * const decompressed = unxzSync(compressedBuffer);
 * ```
 */
export function unxzSync(buffer: Buffer | string, opts?: LZMAOptions): Buffer {
  return xzBufferSync(new Unxz(opts), buffer);
}

/**
 * Compress a buffer asynchronously using callback.
 * @param buffer - Data to compress
 * @param callback - Callback with error or compressed data
 *
 * @example
 * ```ts
 * xz(data, { preset: 6 }, (err, result) => {
 *   if (err) throw err;
 *   fs.writeFileSync('data.xz', result);
 * });
 * ```
 */
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

/**
 * Compress a buffer synchronously.
 * @param buffer - Data to compress
 * @param opts - LZMA compression options
 * @returns Compressed data buffer
 *
 * @example
 * ```ts
 * const compressed = xzSync(data, { preset: 9 });
 * ```
 */
export function xzSync(buffer: Buffer | string, opts?: LZMAOptions): Buffer {
  return xzBufferSync(new Xz(opts), buffer);
}

/**
 * Compress a buffer asynchronously using Promise.
 * @param buffer - Data to compress
 * @param opts - LZMA compression options
 * @returns Promise resolving to compressed data buffer
 *
 * @example
 * ```ts
 * const compressed = await xzAsync(data, { preset: 6 });
 * ```
 */
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

/**
 * Decompress a buffer asynchronously using Promise.
 * @param buffer - Compressed data to decompress
 * @param opts - LZMA decompression options
 * @returns Promise resolving to decompressed data buffer
 *
 * @example
 * ```ts
 * const decompressed = await unxzAsync(compressedBuffer);
 * console.log(decompressed.toString());
 * ```
 */
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

// F-014: Default export for CommonJS compatibility
// @deprecated Use named exports instead for better tree-shaking. Will be removed in v3.0.
// eslint-disable-next-line import/no-default-export
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
