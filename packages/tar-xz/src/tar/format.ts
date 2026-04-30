/**
 * TAR format parsing and creation (POSIX ustar format)
 *
 * TAR header structure (512 bytes):
 * - name:     100 bytes (file name)
 * - mode:       8 bytes (octal permissions)
 * - uid:        8 bytes (octal user id)
 * - gid:        8 bytes (octal group id)
 * - size:      12 bytes (octal file size)
 * - mtime:     12 bytes (octal modification time)
 * - chksum:     8 bytes (header checksum)
 * - typeflag:   1 byte  (entry type)
 * - linkname: 100 bytes (link target)
 * - magic:      6 bytes ("ustar\0")
 * - version:    2 bytes ("00")
 * - uname:     32 bytes (user name)
 * - gname:     32 bytes (group name)
 * - devmajor:   8 bytes (device major)
 * - devminor:   8 bytes (device minor)
 * - prefix:   155 bytes (path prefix for long names)
 * - padding:   12 bytes (unused)
 */

import type { TarEntry, TarEntryTypeValue } from '../types.js';
import { TarEntryType } from '../types.js';
import { calculateChecksum, parseOctal, verifyChecksum, writeChecksum } from './checksum.js';

/** TAR block size */
export const BLOCK_SIZE = 512;

/** USTAR magic string */
const USTAR_MAGIC = 'ustar\0';
const USTAR_VERSION = '00';

/** Header field offsets */
const OFFSETS = {
  name: 0,
  mode: 100,
  uid: 108,
  gid: 116,
  size: 124,
  mtime: 136,
  chksum: 148,
  typeflag: 156,
  linkname: 157,
  magic: 257,
  version: 263,
  uname: 265,
  gname: 297,
  devmajor: 329,
  devminor: 337,
  prefix: 345,
} as const;

/** Header field lengths */
const LENGTHS = {
  name: 100,
  mode: 8,
  uid: 8,
  gid: 8,
  size: 12,
  mtime: 12,
  chksum: 8,
  typeflag: 1,
  linkname: 100,
  magic: 6,
  version: 2,
  uname: 32,
  gname: 32,
  devmajor: 8,
  devminor: 8,
  prefix: 155,
} as const;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: false });

/**
 * Parse string from header field (null-terminated or full length)
 */
function parseString(header: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const limit = offset + length;

  while (end < limit && header[end] !== 0) {
    end++;
  }

  return textDecoder.decode(header.subarray(offset, end));
}

/**
 * Write string to header field (null-terminated if fits)
 */
function writeString(header: Uint8Array, offset: number, length: number, value: string): void {
  const bytes = textEncoder.encode(value);
  const writeLen = Math.min(bytes.length, length);

  for (let i = 0; i < writeLen; i++) {
    const b = bytes[i];
    /* v8 ignore start: unreachable — TypeScript noUncheckedIndexedAccess guard; bytes[i] is always
     * defined within i < writeLen = min(bytes.length, length), so the undefined branch cannot fire. */
    if (b === undefined) break;
    /* v8 ignore stop */
    header[offset + i] = b;
  }

  // Null-terminate if there's room
  if (writeLen < length) {
    header[offset + writeLen] = 0;
  }
}

/**
 * Write octal number to header field
 */
function writeOctal(header: Uint8Array, offset: number, length: number, value: number): void {
  // Leave room for null terminator
  const octalStr = value.toString(8).padStart(length - 1, '0');
  for (let i = 0; i < length - 1; i++) {
    header[offset + i] = octalStr.charCodeAt(i);
  }
  header[offset + length - 1] = 0; // null terminator
}

/**
 * Check if a header block is empty (end of archive marker)
 */
export function isEmptyBlock(block: Uint8Array): boolean {
  for (const byte of block) {
    if (byte !== 0) {
      return false;
    }
  }
  return true;
}

/**
 * Check if header has valid USTAR magic
 */

/**
 * Parse TAR header into entry metadata
 *
 * @param header - 512-byte header block
 * @returns Parsed entry or null if empty block
 * @throws Error if header is invalid
 */
export function parseHeader(header: Uint8Array): TarEntry | null {
  if (header.length !== BLOCK_SIZE) {
    throw new Error(`Invalid header length: ${header.length}`);
  }

  // Check for end-of-archive marker (two empty blocks)
  if (isEmptyBlock(header)) {
    return null;
  }

  // Verify checksum
  if (!verifyChecksum(header)) {
    throw new Error('Invalid TAR header checksum');
  }

  // Parse name (may be split between prefix and name fields)
  let name = parseString(header, OFFSETS.name, LENGTHS.name);
  const prefix = parseString(header, OFFSETS.prefix, LENGTHS.prefix);

  if (prefix.length > 0) {
    name = `${prefix}/${name}`;
  }

  // Parse type flag
  /* v8 ignore start: unreachable — TypeScript noUncheckedIndexedAccess guard; header[156] is always
   * defined after the 512-byte length validation above (OFFSETS.typeflag = 156 < 512). */
  const typeFlag = header[OFFSETS.typeflag] ?? 0;
  /* v8 ignore stop */
  const typeFlagChar = String.fromCharCode(typeFlag);

  // Handle legacy type (null or empty = regular file)
  /* v8 ignore start: unreachable — String.fromCharCode always returns a 1-char string for byte values [0,255]; the empty-string case is a legacy defensive guard that cannot fire */
  const isEmptyChar = typeFlagChar === '';
  /* v8 ignore stop */
  // NOTE: the '\0' arm (null typeflag) is under-tested — no test currently exercises header[156]===0.
  // That is a known partial; adding that test is deferred to a follow-up (out of scope here).
  const type: TarEntryTypeValue =
    typeFlagChar === '\0' || isEmptyChar ? TarEntryType.FILE : (typeFlagChar as TarEntryTypeValue);

  return {
    name,
    type,
    size: parseOctal(header, OFFSETS.size, LENGTHS.size),
    mode: parseOctal(header, OFFSETS.mode, LENGTHS.mode),
    uid: parseOctal(header, OFFSETS.uid, LENGTHS.uid),
    gid: parseOctal(header, OFFSETS.gid, LENGTHS.gid),
    mtime: parseOctal(header, OFFSETS.mtime, LENGTHS.mtime),
    uname: parseString(header, OFFSETS.uname, LENGTHS.uname),
    gname: parseString(header, OFFSETS.gname, LENGTHS.gname),
    devmajor: parseOctal(header, OFFSETS.devmajor, LENGTHS.devmajor),
    devminor: parseOctal(header, OFFSETS.devminor, LENGTHS.devminor),
    linkname: parseString(header, OFFSETS.linkname, LENGTHS.linkname),
  };
}

/**
 * Options for creating a TAR header
 */
export interface CreateHeaderOptions {
  /** File name */
  name: string;
  /** Entry type (default: FILE or DIRECTORY based on trailing slash) */
  type?: TarEntryTypeValue;
  /** File size in bytes (default: 0) */
  size?: number;
  /** File mode (default: 0o644 for files, 0o755 for directories) */
  mode?: number;
  /** User ID (default: 0) */
  uid?: number;
  /** Group ID (default: 0) */
  gid?: number;
  /** Modification time in seconds (default: now) */
  mtime?: number;
  /** User name (default: "") */
  uname?: string;
  /** Group name (default: "") */
  gname?: string;
  /** Link target for symlinks (default: "") */
  linkname?: string;
}

/**
 * Create TAR header block
 *
 * @param options - Header options
 * @returns 512-byte header block
 */

/**
 * Split a long TAR name into a prefix + name pair using the USTAR 155/100 fields.
 * Throws if the name cannot be split to fit.
 */
function splitLongName(fullName: string): { prefix: string; name: string } {
  const maxPrefix = LENGTHS.prefix;
  const splitIdx = fullName.lastIndexOf('/', maxPrefix);

  if (splitIdx > 0 && fullName.length - splitIdx - 1 <= LENGTHS.name) {
    return {
      prefix: fullName.substring(0, splitIdx),
      name: fullName.substring(splitIdx + 1),
    };
  }

  throw new Error(`File name too long for TAR format: ${fullName} (use PAX for names > 255 chars)`);
}

export function createHeader(options: CreateHeaderOptions): Uint8Array {
  const header = new Uint8Array(BLOCK_SIZE);

  let { name } = options;
  const isDir = name.endsWith('/');

  // Determine type
  const type = options.type ?? (isDir ? TarEntryType.DIRECTORY : TarEntryType.FILE);

  // Handle long names using prefix field
  let prefix = '';
  if (name.length > LENGTHS.name) {
    ({ prefix, name } = splitLongName(name));
  }

  // Default mode based on type
  const defaultMode = type === TarEntryType.DIRECTORY ? 0o755 : 0o644;
  const mode = options.mode ?? defaultMode;

  // Default mtime to now
  const mtime = options.mtime ?? Math.floor(Date.now() / 1000);

  // Write fields
  writeString(header, OFFSETS.name, LENGTHS.name, name);
  writeOctal(header, OFFSETS.mode, LENGTHS.mode, mode);
  writeOctal(header, OFFSETS.uid, LENGTHS.uid, options.uid ?? 0);
  writeOctal(header, OFFSETS.gid, LENGTHS.gid, options.gid ?? 0);
  writeOctal(header, OFFSETS.size, LENGTHS.size, options.size ?? 0);
  writeOctal(header, OFFSETS.mtime, LENGTHS.mtime, mtime);

  // Type flag
  header[OFFSETS.typeflag] = type.charCodeAt(0);

  // Link name
  writeString(header, OFFSETS.linkname, LENGTHS.linkname, options.linkname ?? '');

  // USTAR magic and version
  writeString(header, OFFSETS.magic, LENGTHS.magic, USTAR_MAGIC);
  writeString(header, OFFSETS.version, LENGTHS.version, USTAR_VERSION);

  // User/group names
  writeString(header, OFFSETS.uname, LENGTHS.uname, options.uname ?? '');
  writeString(header, OFFSETS.gname, LENGTHS.gname, options.gname ?? '');

  // Device numbers (0 for regular files)
  writeOctal(header, OFFSETS.devmajor, LENGTHS.devmajor, 0);
  writeOctal(header, OFFSETS.devminor, LENGTHS.devminor, 0);

  // Prefix for long names
  writeString(header, OFFSETS.prefix, LENGTHS.prefix, prefix);

  // Calculate and write checksum
  writeChecksum(header);

  return header;
}

/**
 * Create padding to align to block boundary
 *
 * @param size - Content size
 * @returns Padding bytes needed (0 to 511)
 */
export function calculatePadding(size: number): number {
  const remainder = size % BLOCK_SIZE;
  return remainder === 0 ? 0 : BLOCK_SIZE - remainder;
}

/**
 * Create end-of-archive marker (two empty blocks)
 */
export function createEndOfArchive(): Uint8Array {
  return new Uint8Array(BLOCK_SIZE * 2);
}

export { calculateChecksum, verifyChecksum };
