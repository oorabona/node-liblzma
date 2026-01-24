/**
 * Shared TypeScript types for node-liblzma
 */

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

export type CompressionCallback = (error: Error | null, result?: Buffer) => void;

// Union types for better type safety and validation
export type LZMAActionType = 0 | 1 | 2 | 3; // RUN | SYNC_FLUSH | FULL_FLUSH | FINISH
export type LZMAStatusType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11; // All LZMA status codes
export type CheckType = 0 | 1 | 4 | 10; // NONE | CRC32 | CRC64 | SHA256
// F-013: Preset is a number 0-9 optionally OR'ed with EXTREME flag (0x80000000)
// Examples: 6 (default), 9 (max), 6 | EXTREME (default + extreme)
export type PresetType = number;
export type FilterType = 0x21 | 0x03 | 0x04 | 0x06 | 0x07 | 0x08 | 0x09; // LZMA2 | X86 | POWERPC | IA64 | ARM | ARMTHUMB | SPARC
export type ModeType = 1 | 2; // FAST | NORMAL
