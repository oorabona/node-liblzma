/**
 * Shared TypeScript types for node-liblzma
 */

import type { TransformOptions } from 'node:stream';

/** Internal callback for native LZMA operations */
export type NativeLZMACallback = (
  errno: number,
  availInAfter: number,
  availOutAfter: number
) => boolean;

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
  /**
   * Memory usage limit for decompression, in bytes.
   *
   * **Honored by all decoder APIs** (`unxz`, `unxzAsync`, `Unxz`, `createUnxz` — both native
   * and WASM paths). `xzAsync` is compression-only and does not read `memlimit`.
   *
   * Accepted types: `number` or `bigint`. Both are validated before reaching the
   * decoder. The native binding accepts either type directly via N-API; the WASM
   * Buffer API coerces to `bigint` for the C ABI. The `number` form must be a
   * finite, non-negative integer; passing
   * `NaN`, `Infinity`, a fractional value, or a negative number throws
   * `LZMAOptionsError` before any decompression is attempted.
   * For values ≥ `Number.MAX_SAFE_INTEGER` (2^53 - 1), use `bigint` to avoid
   * precision loss on coercion; passing a `number` above this threshold also
   * throws `LZMAOptionsError`.
   * `bigint` values above `UINT64_MAX` (2^64 - 1) are also rejected with
   * `LZMAOptionsError`.
   *
   * Default: `UINT64_MAX` (no limit) for native; `BigInt(256 * 1024 * 1024)` (256 MiB)
   * for WASM buffer APIs (`unxz`/`unxzAsync`).
   *
   * When the compressed stream requires more memory than this limit,
   * decompression throws/emits `LZMAMemoryLimitError` with
   * `code === LZMA_MEMLIMIT_ERROR` (numeric constant `6`, re-exported from
   * `src/errors.ts`).
   */
  memlimit?: number | bigint;
}

/**
 * Callback function for asynchronous compression/decompression operations.
 * @param error - Error object if operation failed, null otherwise
 * @param result - Compressed or decompressed data buffer
 */
export type CompressionCallback = (error: Error | null, result?: Buffer) => void;

/**
 * LZMA action type for stream operations.
 * - `0` (RUN): Normal processing
 * - `1` (SYNC_FLUSH): Flush pending output
 * - `2` (FULL_FLUSH): Flush and reset encoder state
 * - `3` (FINISH): Finish the stream
 */
export type LZMAActionType = 0 | 1 | 2 | 3;

/**
 * LZMA status codes returned by operations.
 * - `0` (OK): Operation completed successfully
 * - `1` (STREAM_END): End of stream reached
 * - `2` (NO_CHECK): Input has no integrity check
 * - `3` (UNSUPPORTED_CHECK): Cannot calculate integrity check
 * - `4` (GET_CHECK): Integrity check available
 * - `5` (MEM_ERROR): Memory allocation failed
 * - `6` (MEMLIMIT_ERROR): Memory limit reached
 * - `7` (FORMAT_ERROR): File format not recognized
 * - `8` (OPTIONS_ERROR): Invalid options
 * - `9` (DATA_ERROR): Data is corrupt
 * - `10` (BUF_ERROR): No progress possible
 * - `11` (PROG_ERROR): Programming error
 */
export type LZMAStatusType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/**
 * Integrity check type for XZ streams.
 * - `0` (NONE): No integrity check
 * - `1` (CRC32): 32-bit CRC
 * - `4` (CRC64): 64-bit CRC (recommended)
 * - `10` (SHA256): SHA-256 hash
 */
export type CheckType = 0 | 1 | 4 | 10;

/**
 * Compression preset level (0-9), optionally combined with EXTREME flag.
 * Higher values = better compression but slower.
 * @example
 * ```ts
 * const preset = 6; // Default compression
 * const extreme = 6 | 0x80000000; // Default with extreme flag
 * ```
 */
export type PresetType = number;

/**
 * Filter type for LZMA2 compression chain.
 * - `0x21` (LZMA2): Main compression filter
 * - `0x03` (X86): BCJ filter for x86 executables
 * - `0x04` (POWERPC): BCJ filter for PowerPC
 * - `0x06` (IA64): BCJ filter for IA-64
 * - `0x07` (ARM): BCJ filter for ARM
 * - `0x08` (ARMTHUMB): BCJ filter for ARM-Thumb
 * - `0x09` (SPARC): BCJ filter for SPARC
 */
export type FilterType = 0x21 | 0x03 | 0x04 | 0x06 | 0x07 | 0x08 | 0x09;

/**
 * Compression mode.
 * - `1` (FAST): Faster compression, less memory
 * - `2` (NORMAL): Better compression ratio
 */
export type ModeType = 1 | 2;

/**
 * Progress event data emitted during compression/decompression
 */
export interface ProgressInfo {
  /** Total bytes read from input so far */
  bytesRead: number;
  /** Total bytes written to output so far */
  bytesWritten: number;
}

export interface StreamOptions extends TransformOptions {
  /** LZMA-specific options */
  lzma?: LZMAOptions;
}

/**
 * Metadata extracted from an XZ file index.
 */
export interface XZFileIndex {
  /** Uncompressed size in bytes */
  uncompressedSize: number;
  /** Compressed size in bytes */
  compressedSize: number;
  /** Number of streams in the file */
  streamCount: number;
  /** Number of blocks in the file */
  blockCount: number;
  /** Integrity check type (see check.CRC32, check.CRC64, etc.) */
  check: number;
  /** Memory usage of the index structure */
  memoryUsage: number;
}
