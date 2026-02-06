/**
 * TAR header checksum calculation
 *
 * The checksum is a simple sum of all bytes in the header block,
 * with the 8-byte checksum field (bytes 148-155) treated as spaces (0x20).
 */

/** Offset of checksum field in TAR header */
export const CHECKSUM_OFFSET = 148;

/** Length of checksum field */
export const CHECKSUM_LENGTH = 8;

/**
 * Calculate TAR header checksum
 *
 * @param header - 512-byte TAR header block
 * @returns Checksum value (sum of unsigned bytes, checksum field as spaces)
 */
export function calculateChecksum(header: Uint8Array): number {
  if (header.length !== 512) {
    throw new Error(`Invalid TAR header length: ${header.length}, expected 512`);
  }

  let sum = 0;

  for (let i = 0; i < 512; i++) {
    // Treat checksum field (bytes 148-155) as spaces (0x20 = 32)
    if (i >= CHECKSUM_OFFSET && i < CHECKSUM_OFFSET + CHECKSUM_LENGTH) {
      sum += 0x20;
    } else {
      sum += header[i];
    }
  }

  return sum;
}

/**
 * Verify TAR header checksum
 *
 * @param header - 512-byte TAR header block
 * @returns true if checksum is valid
 */
export function verifyChecksum(header: Uint8Array): boolean {
  const calculated = calculateChecksum(header);
  const stored = parseOctal(header, CHECKSUM_OFFSET, CHECKSUM_LENGTH);

  return calculated === stored;
}

/**
 * Write checksum to TAR header
 *
 * @param header - 512-byte TAR header block (will be modified)
 */
export function writeChecksum(header: Uint8Array): void {
  // First, fill checksum field with spaces
  for (let i = 0; i < CHECKSUM_LENGTH; i++) {
    header[CHECKSUM_OFFSET + i] = 0x20;
  }

  // Calculate checksum
  const checksum = calculateChecksum(header);

  // Write checksum as 6-digit octal, space, null
  const octalStr = checksum.toString(8).padStart(6, '0');
  for (let i = 0; i < 6; i++) {
    header[CHECKSUM_OFFSET + i] = octalStr.charCodeAt(i);
  }
  header[CHECKSUM_OFFSET + 6] = 0x00; // null terminator
  header[CHECKSUM_OFFSET + 7] = 0x20; // space
}

/**
 * Parse octal number from header field
 *
 * @param header - Header buffer
 * @param offset - Field offset
 * @param length - Field length
 * @returns Parsed number
 */
export function parseOctal(header: Uint8Array, offset: number, length: number): number {
  let str = '';

  for (let i = 0; i < length; i++) {
    const byte = header[offset + i];
    // Stop at null or space
    if (byte === 0 || byte === 0x20) {
      break;
    }
    str += String.fromCharCode(byte);
  }

  if (str.length === 0) {
    return 0;
  }

  const value = Number.parseInt(str, 8);
  if (Number.isNaN(value)) {
    return 0;
  }

  return value;
}
