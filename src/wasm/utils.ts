/**
 * WASM utility functions for browser usage.
 *
 * Provides isXZ, versionString, versionNumber, parseFileIndex
 * matching the Node.js API signatures.
 */

import { checkIsSupported, versionString as wasmVersionString } from './bindings.js';

/** XZ magic bytes: 0xFD + "7zXZ" + 0x00 */
const XZ_MAGIC = new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);

/**
 * Check if a buffer contains XZ compressed data.
 *
 * @param buffer - Data to check
 * @returns true if the buffer starts with the XZ magic bytes
 */
export function isXZ(buffer: Uint8Array | ArrayBuffer): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.byteLength < XZ_MAGIC.length) return false;
  for (let i = 0; i < XZ_MAGIC.length; i++) {
    if (data[i] !== XZ_MAGIC[i]) return false;
  }
  return true;
}

/**
 * Get the liblzma version string (e.g. "5.6.3").
 */
export function versionString(): string {
  return wasmVersionString();
}

/**
 * Get the liblzma version as a number (e.g. 50060030 for 5.6.3).
 */
export function versionNumber(): number {
  const parts = wasmVersionString().split('.');
  const major = Number.parseInt(parts[0], 10);
  const minor = Number.parseInt(parts[1], 10);
  const patch = Number.parseInt(parts[2], 10);
  return major * 10000000 + minor * 10000 + patch * 10;
}

/**
 * Get memory usage estimate for the easy encoder with given preset.
 *
 * Note: In WASM, this is approximated based on preset level.
 * Presets 7-9 require significantly more memory at runtime than reported here
 * and may exceed the default WASM memory limit (256MB).
 */
export function easyEncoderMemusage(preset: number): number {
  // Approximate memory usage per preset (from liblzma docs)
  const usageByPreset: Record<number, number> = {
    0: 1572864, // ~1.5 MB
    1: 2097152, // ~2 MB
    2: 3145728, // ~3 MB
    3: 4194304, // ~4 MB
    4: 5242880, // ~5 MB
    5: 6291456, // ~6 MB
    6: 9437184, // ~9 MB
    7: 17825792, // ~17 MB
    8: 34603008, // ~33 MB
    9: 67108864, // ~64 MB
  };
  return usageByPreset[preset & 0x1f] ?? usageByPreset[6];
}

/**
 * Get memory usage estimate for the easy decoder.
 */
export function easyDecoderMemusage(): number {
  // Decoder memory usage is typically ~2-65MB depending on the stream
  // Default estimate for typical streams
  return 67108864; // ~64 MB (worst case for preset 9)
}

/** XZ file index information */
export interface XZFileIndex {
  /** Uncompressed size in bytes */
  uncompressedSize: number;
  /** Compressed size in bytes (total file size including headers) */
  compressedSize: number;
  /** Number of streams in the file */
  streamCount: number;
  /** Number of blocks in the file */
  blockCount: number;
  /** Integrity check type */
  check: number;
  /** Memory usage of the index structure */
  memoryUsage: number;
}

/**
 * Parse the index of an XZ file to extract metadata.
 *
 * @param buffer - Complete XZ file data
 * @returns File index information
 */
export function parseFileIndex(buffer: Uint8Array | ArrayBuffer): XZFileIndex {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (!isXZ(data)) {
    throw new Error('Not a valid XZ file');
  }

  // Parse XZ stream footer to get basic info
  // XZ footer is last 12 bytes: CRC32(4) + Backward Size(4) + Flags(2) + 'YZ'(2)
  if (data.byteLength < 24) {
    throw new Error('XZ file too small to contain valid index');
  }

  const footer = data.subarray(data.byteLength - 12);
  // Verify footer magic 'YZ' (0x59, 0x5A)
  if (footer[10] !== 0x59 || footer[11] !== 0x5a) {
    throw new Error('Invalid XZ footer');
  }

  // Stream flags (check type is in bits 0-3 of the first flag byte)
  const checkType = footer[8] & 0x0f;

  // Backward size (little-endian uint32, value = (stored + 1) * 4)
  const backwardSize =
    ((footer[4] | (footer[5] << 8) | (footer[6] << 16) | (footer[7] << 24)) + 1) * 4;

  return {
    uncompressedSize: 0, // Not available from footer alone; requires full index parsing
    compressedSize: data.byteLength,
    streamCount: 1,
    blockCount: 1,
    check: checkType,
    memoryUsage: backwardSize,
  };
}

export { checkIsSupported };

/** Convert various input types to Uint8Array */
export function toUint8Array(input: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new TextEncoder().encode(input);
}
