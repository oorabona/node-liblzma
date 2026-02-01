/**
 * WASM compression functions for browser usage.
 *
 * Provides xzAsync, xz (callback), and xzSync (throws in browser)
 * matching the Node.js API signatures.
 */

import { LZMAError } from '../errors.js';
import type { CompressionCallback, LZMAOptions } from '../types.js';
import { easyBufferEncode, initModule } from './bindings.js';
import { LZMA_CHECK_CRC64 } from './types.js';
import { toUint8Array } from './utils.js';

/**
 * Compress a buffer to XZ format (async, Promise-based).
 *
 * @param buffer - Data to compress (Uint8Array, ArrayBuffer, or string)
 * @param opts - Compression options (preset, check)
 * @returns Compressed XZ data
 */
export async function xzAsync(
  buffer: Uint8Array | ArrayBuffer | string,
  opts?: LZMAOptions
): Promise<Uint8Array> {
  await initModule();
  const input = toUint8Array(buffer);
  const preset = opts?.preset ?? 6;
  const check = opts?.check ?? LZMA_CHECK_CRC64;
  return easyBufferEncode(input, preset, check);
}

/**
 * Compress a buffer to XZ format (callback-based).
 *
 * @param buffer - Data to compress
 * @param optsOrCallback - Options or callback
 * @param callback - Callback (if opts provided)
 */
export function xz(buffer: Uint8Array | ArrayBuffer | string, callback: CompressionCallback): void;
export function xz(
  buffer: Uint8Array | ArrayBuffer | string,
  opts: LZMAOptions,
  callback: CompressionCallback
): void;
export function xz(
  buffer: Uint8Array | ArrayBuffer | string,
  optsOrCallback: LZMAOptions | CompressionCallback,
  callback?: CompressionCallback
): void {
  let opts: LZMAOptions;
  let cb: CompressionCallback;
  if (typeof optsOrCallback === 'function') {
    cb = optsOrCallback;
    opts = {};
  } else {
    opts = optsOrCallback;
    cb = callback as CompressionCallback;
  }

  xzAsync(buffer, opts).then(
    (result) => cb(null, result as unknown as Buffer),
    (error) => cb(error instanceof Error ? error : new Error(String(error)))
  );
}

/**
 * Synchronous XZ compression — **throws in browser**.
 *
 * Sync operations are not supported in WASM because they would block
 * the main thread. Use xzAsync() instead.
 */
export function xzSync(_buffer: Uint8Array | ArrayBuffer | string, _opts?: LZMAOptions): never {
  throw new LZMAError('Sync operations not supported in browser. Use xzAsync() instead.', -1);
}
