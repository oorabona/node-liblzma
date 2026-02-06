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
 * TAR entry with content data
 */
export interface TarEntryWithData extends TarEntry {
  /** File content */
  data: Uint8Array;
}

/**
 * Input file for archive creation
 */
export interface TarInputFile {
  /** File path in archive */
  name: string;
  /** File content (string, Uint8Array, ArrayBuffer, or Blob) */
  content: string | Uint8Array | ArrayBuffer | Blob;
  /** Optional file mode (default: 0o644 for files, 0o755 for directories) */
  mode?: number;
  /** Optional modification time (default: current time) */
  mtime?: Date | number;
}

/**
 * Options for creating tar.xz archives (Node.js)
 */
export interface CreateOptions {
  /** Output file path */
  file: string;
  /** Base directory for file paths */
  cwd?: string;
  /** Files/directories to include */
  files: string[];
  /** XZ compression preset (0-9, default: 6) */
  preset?: number;
  /** Follow symbolic links */
  follow?: boolean;
  /** Dereference symlinks (archive target, not link) */
  dereference?: boolean;
}

/**
 * Options for extracting tar.xz archives (Node.js)
 */
export interface ExtractOptions {
  /** Input file path */
  file: string;
  /** Output directory */
  cwd?: string;
  /** Number of leading path components to strip */
  strip?: number;
  /** Filter function to select entries */
  filter?: (entry: TarEntry) => boolean;
  /** Preserve file ownership (requires root) */
  preserveOwner?: boolean;
}

/**
 * Options for listing tar.xz archives (Node.js)
 */
export interface ListOptions {
  /** Input file path */
  file: string;
}

/**
 * Options for browser-based archive creation
 */
export interface BrowserCreateOptions {
  /** Files to include */
  files: TarInputFile[];
  /** XZ compression preset (0-9, default: 3 for browser performance) */
  preset?: number;
}

/**
 * Options for browser-based archive extraction
 */
export interface BrowserExtractOptions {
  /** Number of leading path components to strip */
  strip?: number;
  /** Filter function to select entries */
  filter?: (entry: TarEntry) => boolean;
}

/**
 * Extracted file from browser API
 */
export interface ExtractedFile {
  /** File path */
  name: string;
  /** File content */
  data: Uint8Array;
  /** File metadata */
  entry: TarEntry;
}
