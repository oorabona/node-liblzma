/**
 * node-liblzma - Node.js bindings for liblzma
 * TypeScript definitions
 */

import { Transform, TransformOptions } from 'node:stream';

/** Internal callback for native LZMA operations */
export type NativeLZMACallback = (errno: number, availInAfter: number, availOutAfter: number) => boolean;

/** Interface for the native LZMA object */
export interface NativeLZMA {
  /** Synchronous compression/decompression */
  codeSync(
    flushFlag: number,
    chunk: Buffer | null,
    inOff: number,
    availInBefore: number | undefined,
    buffer: Buffer,
    offset: number
  ): [number, number, number];
  
  /** Asynchronous compression/decompression */  
  code(
    flushFlag: number,
    chunk: Buffer | null,
    inOff: number,
    availInBefore: number | undefined,
    buffer: Buffer,
    offset: number,
    callback: NativeLZMACallback
  ): void;
  
  /** Close the LZMA stream */
  close(): void;
}


export interface LZMAOptions {
  /** Integrity check type */
  check?: number;
  /** Compression preset level */
  preset?: number;
  /** Array of filters to use */
  filters?: number[];
  /** Compression mode */
  mode?: number;
  /** Number of threads for compression (encoding only) */
  threads?: number;
  /** Chunk size for processing */
  chunkSize?: number;
  /** Flush flag to use */
  flushFlag?: number;
}

export interface StreamOptions extends TransformOptions {
  /** LZMA-specific options */
  lzma?: LZMAOptions;
}

// Legacy string types for backward compatibility (deprecated)
export type CheckType = 'NONE' | 'CRC32' | 'CRC64' | 'SHA256';
export type PresetType = 'DEFAULT' | 'EXTREME';
export type FilterType = 'LZMA2' | 'X86' | 'POWERPC' | 'IA64' | 'ARM' | 'ARMTHUMB' | 'SPARC';
export type ModeType = 'FAST' | 'NORMAL';
export type FlagType = 'TELL_NO_CHECK' | 'TELL_UNSUPPORTED_CHECK' | 'TELL_ANY_CHECK' | 'CONCATENATED';

export type CompressionCallback = (error: Error | null, result?: Buffer) => void;

export declare abstract class XzStream extends Transform {
  constructor(streamMode: number, opts?: LZMAOptions, options?: TransformOptions);
  
  /** Flush the stream with specified flush type */
  flush(callback?: () => void): void;
  flush(kind: number, callback?: () => void): void;
  
  /** Close the stream */
  close(callback?: () => void): void;
  
  _transform(chunk: Buffer | null, encoding: string, callback: (error?: Error) => void): void;
  _flush(callback: () => void): void;
  protected _processChunk(chunk: Buffer | null, flushFlag: number, callback?: (error?: Error) => void): Buffer | undefined;
}

export declare class Xz extends XzStream {
  constructor(lzmaOptions?: LZMAOptions, options?: TransformOptions);
}

export declare class Unxz extends XzStream {
  constructor(lzmaOptions?: LZMAOptions, options?: TransformOptions);
}

/** Check if threading support is available */
export declare function hasThreads(): boolean;

/** Create a compression stream */
export declare function createXz(lzmaOptions?: LZMAOptions, options?: TransformOptions): Xz;

/** Create a decompression stream */
export declare function createUnxz(lzmaOptions?: LZMAOptions, options?: TransformOptions): Unxz;

/** Compress a buffer asynchronously */
export declare function xz(buffer: Buffer | string, callback: CompressionCallback): void;
export declare function xz(buffer: Buffer | string, options: LZMAOptions, callback: CompressionCallback): void;

/** Decompress a buffer asynchronously */
export declare function unxz(buffer: Buffer | string, callback: CompressionCallback): void;
export declare function unxz(buffer: Buffer | string, options: LZMAOptions, callback: CompressionCallback): void;

/** Compress a buffer synchronously */
export declare function xzSync(buffer: Buffer | string, options?: LZMAOptions): Buffer;

/** Decompress a buffer synchronously */
export declare function unxzSync(buffer: Buffer | string, options?: LZMAOptions): Buffer;

/** Compress a buffer asynchronously using Promises */
export declare function xzAsync(buffer: Buffer | string, options?: LZMAOptions): Promise<Buffer>;

/** Decompress a buffer asynchronously using Promises */
export declare function unxzAsync(buffer: Buffer | string, options?: LZMAOptions): Promise<Buffer>;

/** Constants for integrity check types */
export declare const check: {
  readonly NONE: number;
  readonly CRC32: number;
  readonly CRC64: number;
  readonly SHA256: number;
};

/** Constants for compression presets */
export declare const preset: {
  readonly DEFAULT: number;
  readonly EXTREME: number;
};

/** Constants for compression modes */
export declare const mode: {
  readonly FAST: number;
  readonly NORMAL: number;
};

/** Constants for stream flags */
export declare const flag: {
  readonly TELL_NO_CHECK: number;
  readonly TELL_UNSUPPORTED_CHECK: number;
  readonly TELL_ANY_CHECK: number;
  readonly CONCATENATED: number;
};

/** Constants for compression filters */
export declare const filter: {
  readonly LZMA2: number;
  readonly X86: number;
  readonly POWERPC: number;
  readonly IA64: number;
  readonly ARM: number;
  readonly ARMTHUMB: number;
  readonly SPARC: number;
};

/** LZMA error messages by error code */
export declare const messages: readonly string[];

// LZMA action constants
export declare const LZMA_RUN: number;
export declare const LZMA_SYNC_FLUSH: number;
export declare const LZMA_FULL_FLUSH: number;
export declare const LZMA_FINISH: number;

// LZMA status/error constants
export declare const LZMA_OK: number;
export declare const LZMA_STREAM_END: number;
export declare const LZMA_NO_CHECK: number;
export declare const LZMA_UNSUPPORTED_CHECK: number;
export declare const LZMA_GET_CHECK: number;
export declare const LZMA_MEM_ERROR: number;
export declare const LZMA_MEMLIMIT_ERROR: number;
export declare const LZMA_FORMAT_ERROR: number;
export declare const LZMA_OPTIONS_ERROR: number;
export declare const LZMA_DATA_ERROR: number;
export declare const LZMA_BUF_ERROR: number;
export declare const LZMA_PROG_ERROR: number;

// Additional filter constants
export declare const LZMA_FILTER_X86: number;
export declare const LZMA_FILTER_POWERPC: number;
export declare const LZMA_FILTER_IA64: number;
export declare const LZMA_FILTER_ARM: number;
export declare const LZMA_FILTER_ARMTHUMB: number;
export declare const LZMA_FILTERS_MAX: number;

// Grouped constants for better organization
export declare const LZMAAction: {
  readonly RUN: number;
  readonly SYNC_FLUSH: number;
  readonly FULL_FLUSH: number;
  readonly FINISH: number;
};

export declare const LZMAStatus: {
  readonly OK: number;
  readonly STREAM_END: number;
  readonly NO_CHECK: number;
  readonly UNSUPPORTED_CHECK: number;
  readonly GET_CHECK: number;
  readonly MEM_ERROR: number;
  readonly MEMLIMIT_ERROR: number;
  readonly FORMAT_ERROR: number;
  readonly OPTIONS_ERROR: number;
  readonly DATA_ERROR: number;
  readonly BUF_ERROR: number;
  readonly PROG_ERROR: number;
};

export declare const LZMAFilter: {
  readonly LZMA2: number;
  readonly X86: number;
  readonly POWERPC: number;
  readonly IA64: number;
  readonly ARM: number;
  readonly ARMTHUMB: number;
  readonly SPARC: number;
  readonly X86_ALT: number;
  readonly POWERPC_ALT: number;
  readonly IA64_ALT: number;
  readonly ARM_ALT: number;
  readonly ARMTHUMB_ALT: number;
  readonly FILTERS_MAX: number;
};

// Error messages enum
export declare enum LZMAErrorMessage {
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

// Union types for better type safety
export type LZMAActionType = 0 | 1 | 2 | 3;
export type LZMAStatusType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type CheckType = 0 | 1 | 4 | 10;
export type PresetType = 6 | 9;
export type FilterType = 0x21 | 0x03 | 0x04 | 0x06 | 0x07 | 0x08 | 0x09;
export type ModeType = 1 | 2;

