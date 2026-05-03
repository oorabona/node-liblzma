/**
 * tar-xz v6 — Universal type definitions
 *
 * Same types used by both Node.js and Browser implementations.
 *
 * @packageDocumentation
 */

/**
 * TAR entry type flags (POSIX ustar format)
 */
export const TarEntryType = {
  /** Regular file */
  FILE: '0',
  /** Hard link */
  HARDLINK: '1',
  /** Symbolic link */
  SYMLINK: '2',
  /** Character device */
  CHARDEV: '3',
  /** Block device */
  BLOCKDEV: '4',
  /** Directory */
  DIRECTORY: '5',
  /** FIFO (named pipe) */
  FIFO: '6',
  /** Contiguous file */
  CONTIGUOUS: '7',
  /** PAX extended header for next file */
  PAX_HEADER: 'x',
  /** PAX global extended header */
  PAX_GLOBAL: 'g',
} as const;

/**
 * Single-character TAR typeflag literal (POSIX 1003.1 ustar §11.2 + PAX extension).
 *
 * On the wire this is a single byte at offset 156 of the 512-byte header block,
 * interpreted as an ASCII character — not as a numeric value. The digit-shaped
 * flags (`'0'`–`'7'`) are a historical convention, not encoded integers; PAX
 * later extended the set with non-digit chars (`'x'`, `'g'`).
 *
 * Valid values:
 * - `'0'` — FILE (regular file)
 * - `'1'` — HARDLINK
 * - `'2'` — SYMLINK
 * - `'3'` — CHARDEV (character device)
 * - `'4'` — BLOCKDEV (block device)
 * - `'5'` — DIRECTORY
 * - `'6'` — FIFO (named pipe)
 * - `'7'` — CONTIGUOUS file
 * - `'x'` — PAX_HEADER (extended header for next file)
 * - `'g'` — PAX_GLOBAL (global PAX header)
 *
 * @see {@link TarEntryType} for the named-constant equivalents (e.g. `TarEntryType.FILE === '0'`).
 */
export type TarEntryTypeValue = (typeof TarEntryType)[keyof typeof TarEntryType];

/**
 * TAR entry metadata
 */
export interface TarEntry {
  /** File path (relative) */
  name: string;
  /** Entry type */
  type: TarEntryTypeValue;
  /** File size in bytes */
  size: number;
  /** File mode (permissions) */
  mode: number;
  /** User ID */
  uid: number;
  /** Group ID */
  gid: number;
  /** Modification time (seconds since epoch) */
  mtime: number;
  /** User name */
  uname: string;
  /** Group name */
  gname: string;
  /** Device major number (for device files) */
  devmajor: number;
  /** Device minor number (for device files) */
  devminor: number;
  /** Link target (for symlinks and hardlinks) */
  linkname: string;
}

/**
 * TAR entry with streaming content data.
 *
 * `data` is a lazy AsyncIterable — consume it exactly once per entry before
 * advancing to the next entry yielded by `extract()`.
 */
export interface TarEntryWithData extends TarEntry {
  /** Streaming entry content (consume once, in order) */
  data: AsyncIterable<Uint8Array>;
  /**
   * Collect all chunks and decode to a string.
   * @param encoding - Text encoding (default: 'utf-8')
   */
  text(encoding?: string): Promise<string>;
  /** Collect all chunks into a single Uint8Array */
  bytes(): Promise<Uint8Array>;
}

/**
 * Input source for archive creation.
 *
 * In the Node.js implementation, `source` may be a `string` interpreted as an
 * fs path.  In the Browser implementation, `string` sources throw a helpful
 * error (no filesystem access).
 */
export interface TarSourceFile {
  /** Path inside the archive */
  name: string;
  /**
   * File content.
   * - `string` — fs path (Node only; rejected in browser)
   * - `Uint8Array` / `ArrayBuffer` / `Buffer` — raw bytes
   * - `AsyncIterable<Uint8Array>` — streaming source
   */
  source: AsyncIterable<Uint8Array> | Uint8Array | ArrayBuffer | string;
  /** File mode (default: 0o644) */
  mode?: number;
  /** Modification time (default: current time) */
  mtime?: Date;
}

/**
 * Options for `create()`.
 */
export interface CreateOptions {
  /** Files to include in the archive */
  files: TarSourceFile[];
  /** XZ compression preset 0–9 (default: 6) */
  preset?: number;
  /**
   * Optional filter — return `false` to exclude a file.
   * Called with the TarSourceFile before any I/O.
   */
  filter?: (file: TarSourceFile) => boolean;
}

/**
 * Options for `extract()`.
 */
export interface ExtractOptions {
  /** Number of leading path components to strip (default: 0) */
  strip?: number;
  /** Optional filter — return `false` to skip an entry */
  filter?: (entry: TarEntry) => boolean;
}

/**
 * Any stream/buffer type accepted by `extract()` and `list()` as input.
 *
 * Note: `NodeJS.ReadableStream` is handled transparently in the Node.js
 * implementation via the internal `toAsyncIterable` helper.
 * In browsers, pass a `ReadableStream<Uint8Array>` (Web Streams API) instead.
 */
export type TarInput =
  | AsyncIterable<Uint8Array>
  | Iterable<Uint8Array>
  | Uint8Array
  | ArrayBuffer
  | ReadableStream<Uint8Array>;
