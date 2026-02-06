/**
 * PAX extended headers support
 *
 * PAX (Portable Archive eXchange) format allows:
 * - Unlimited file name length
 * - Unlimited link name length
 * - Large file sizes (> 8GB)
 * - Extended attributes
 *
 * PAX records format: "%d %s=%s\n" (length key=value\n)
 * where length includes the length field itself, space, and newline.
 */

import type { TarEntry } from '../types.js';
import { TarEntryType } from '../types.js';
import { calculatePadding, createHeader } from './format.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: false });

/**
 * PAX extended header attributes
 */
export interface PaxAttributes {
  /** File path (overrides header name) */
  path?: string;
  /** Link path (overrides header linkname) */
  linkpath?: string;
  /** File size (for large files > 8GB) */
  size?: number;
  /** Modification time with sub-second precision */
  mtime?: number;
  /** Access time */
  atime?: number;
  /** Creation time */
  ctime?: number;
  /** User ID (for large UIDs) */
  uid?: number;
  /** Group ID (for large GIDs) */
  gid?: number;
  /** User name (longer than 32 chars) */
  uname?: string;
  /** Group name (longer than 32 chars) */
  gname?: string;
  /** Additional custom attributes */
  [key: string]: string | number | undefined;
}

/**
 * Create a PAX record for a key-value pair
 *
 * Format: "%d %s=%s\n" where %d is the total length including itself
 */
function createPaxRecord(key: string, value: string): string {
  const content = ` ${key}=${value}\n`;

  // Calculate length: we need to account for the length field itself
  // Start with an estimate, then adjust
  let lengthStr = content.length.toString();
  let totalLength = lengthStr.length + content.length;

  // Recalculate if adding digits changed the length
  while (totalLength.toString().length !== lengthStr.length) {
    lengthStr = totalLength.toString();
    totalLength = lengthStr.length + content.length;
  }

  return `${totalLength}${content}`;
}

/**
 * Create PAX extended header data
 *
 * @param attrs - PAX attributes to encode
 * @returns Encoded PAX data as Uint8Array
 */
export function createPaxData(attrs: PaxAttributes): Uint8Array {
  let data = '';

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) {
      continue;
    }

    const strValue = typeof value === 'number' ? value.toString() : value;
    data += createPaxRecord(key, strValue);
  }

  return textEncoder.encode(data);
}

/**
 * Parse PAX extended header data
 *
 * @param data - PAX data bytes
 * @returns Parsed attributes
 */
export function parsePaxData(data: Uint8Array): PaxAttributes {
  const text = textDecoder.decode(data);
  const attrs: PaxAttributes = {};
  let pos = 0;

  while (pos < text.length) {
    // Find the space after length
    const spaceIdx = text.indexOf(' ', pos);
    if (spaceIdx === -1) {
      break;
    }

    const length = Number.parseInt(text.substring(pos, spaceIdx), 10);
    if (Number.isNaN(length) || length <= 0) {
      break;
    }

    // Extract the record (length includes the length field and newline)
    const record = text.substring(pos, pos + length);
    const newlineIdx = record.indexOf('\n');
    if (newlineIdx === -1) {
      break;
    }

    // Parse key=value (after the "length " prefix)
    const content = record.substring(spaceIdx - pos + 1, newlineIdx);
    const eqIdx = content.indexOf('=');
    if (eqIdx !== -1) {
      const key = content.substring(0, eqIdx);
      const value = content.substring(eqIdx + 1);

      // Convert numeric fields
      if (
        key === 'size' ||
        key === 'uid' ||
        key === 'gid' ||
        key === 'mtime' ||
        key === 'atime' ||
        key === 'ctime'
      ) {
        attrs[key] = Number.parseFloat(value);
      } else {
        attrs[key] = value;
      }
    }

    pos += length;
  }

  return attrs;
}

/**
 * Check if an entry needs PAX headers
 *
 * @param entry - Entry to check
 * @returns true if PAX headers are needed
 */
export function needsPaxHeaders(entry: {
  name: string;
  linkname?: string;
  size?: number;
}): boolean {
  // Name too long for ustar (100 chars name + 155 chars prefix)
  if (entry.name.length > 255) {
    return true;
  }

  // Link name too long
  if (entry.linkname && entry.linkname.length > 100) {
    return true;
  }

  // File size too large for 11-digit octal (> 8GB)
  if (entry.size !== undefined && entry.size > 0o77777777777) {
    return true;
  }

  return false;
}

/**
 * Create PAX extended header blocks
 *
 * @param originalName - Original file name (used to generate header name)
 * @param attrs - PAX attributes
 * @returns Array of blocks (header + data + padding)
 */
export function createPaxHeaderBlocks(originalName: string, attrs: PaxAttributes): Uint8Array[] {
  const data = createPaxData(attrs);
  const blocks: Uint8Array[] = [];

  // Create header for PAX data
  // Use a shortened version of the original name for the PAX header entry
  const paxName = `PaxHeader/${originalName.substring(0, 80)}`;

  const header = createHeader({
    name: paxName,
    type: TarEntryType.PAX_HEADER,
    size: data.length,
    mode: 0o644,
  });

  blocks.push(header);
  blocks.push(data);

  // Add padding to align to block boundary
  const padding = calculatePadding(data.length);
  if (padding > 0) {
    blocks.push(new Uint8Array(padding));
  }

  return blocks;
}

/**
 * Apply PAX attributes to an entry
 *
 * @param entry - Original entry
 * @param attrs - PAX attributes to apply
 * @returns Modified entry
 */
export function applyPaxAttributes(entry: TarEntry, attrs: PaxAttributes): TarEntry {
  const result = { ...entry };

  if (attrs.path !== undefined) {
    result.name = attrs.path;
  }
  if (attrs.linkpath !== undefined) {
    result.linkname = attrs.linkpath;
  }
  if (attrs.size !== undefined) {
    result.size = attrs.size;
  }
  if (attrs.mtime !== undefined) {
    result.mtime = Math.floor(attrs.mtime);
  }
  if (attrs.uid !== undefined) {
    result.uid = attrs.uid;
  }
  if (attrs.gid !== undefined) {
    result.gid = attrs.gid;
  }
  if (attrs.uname !== undefined) {
    result.uname = attrs.uname;
  }
  if (attrs.gname !== undefined) {
    result.gname = attrs.gname;
  }

  return result;
}
