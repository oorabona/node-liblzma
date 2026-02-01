/**
 * WASM decompression functions for browser usage.
 *
 * Provides unxzAsync, unxz (callback), and unxzSync (throws in browser)
 * matching the Node.js API signatures.
 */

import { LZMAError } from '../errors.js';
import type { CompressionCallback, LZMAOptions } from '../types.js';
import { initModule, streamBufferDecode } from './bindings.js';
import { toUint8Array } from './utils.js';

/**
 * Decompress XZ data (async, Promise-based).
 *
 * @param buffer - XZ compressed data
 * @param opts - Decompression options (memlimit)
 * @returns Decompressed data
 */
export async function unxzAsync(
  buffer: Uint8Array | ArrayBuffer | string,
  _opts?: LZMAOptions
): Promise<Uint8Array> {
  await initModule();
  const input = toUint8Array(buffer);
  // TODO: pass opts.memlimit when LZMAOptions supports it
  return streamBufferDecode(input);
}

/**
 * Decompress XZ data (callback-based).
 *
 * @param buffer - XZ compressed data
 * @param optsOrCallback - Options or callback
 * @param callback - Callback (if opts provided)
 */
export function unxz(
  buffer: Uint8Array | ArrayBuffer | string,
  callback: CompressionCallback
): void;
export function unxz(
  buffer: Uint8Array | ArrayBuffer | string,
  opts: LZMAOptions,
  callback: CompressionCallback
): void;
export function unxz(
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

  unxzAsync(buffer, opts).then(
    (result) => cb(null, result as unknown as Buffer),
    (error) => cb(error instanceof Error ? error : new Error(String(error)))
  );
}

/**
 * Synchronous XZ decompression — **throws in browser**.
 *
 * Sync operations are not supported in WASM because they would block
 * the main thread. Use unxzAsync() instead.
 */
export function unxzSync(_buffer: Uint8Array | ArrayBuffer | string, _opts?: LZMAOptions): never {
  throw new LZMAError('Sync operations not supported in browser. Use unxzAsync() instead.', -1);
}
