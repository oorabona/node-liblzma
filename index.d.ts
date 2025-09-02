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
  check?: typeof check[keyof typeof check];
  /** Compression preset level */
  preset?: typeof preset[keyof typeof preset];
  /** Array of filters to use */
  filters?: (typeof filter[keyof typeof filter])[];
  /** Compression mode */
  mode?: typeof mode[keyof typeof mode];
  /** Number of threads for compression (encoding only) */
  threads?: number;
  /** Chunk size for processing */
  chunkSize?: number;
  /** Flush flag to use */
  flushFlag?: typeof flag[keyof typeof flag];
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

