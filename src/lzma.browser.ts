/**
 * Browser entry point for node-liblzma.
 *
 * This module is automatically resolved by bundlers (Vite, Webpack, esbuild)
 * via the "browser" condition in package.json exports.
 *
 * It exposes the same high-level API as the Node.js entry point, backed by
 * the Emscripten-compiled WASM binary instead of the native C++ addon.
 *
 * Differences from Node.js entry:
 * - xzSync/unxzSync throw LZMAError (sync not supported in browser)
 * - createXz/createUnxz return Web TransformStream (not Node Transform)
 * - No Xz/Unxz/XzStream classes (Node Transform stream wrappers)
 * - No xzFile/unxzFile (filesystem operations)
 * - No xzBuffer/xzBufferSync (Node Buffer-specific)
 */

// --- Error types (shared with Node) ---
export { LZMAError } from './errors.js';
// --- Module initialization ---
export { getModule, initModule, resetModule } from './wasm/bindings.js';
// --- High-level buffer API ---
export { xz, xzAsync, xzSync } from './wasm/compress.js';
export { unxz, unxzAsync, unxzSync } from './wasm/decompress.js';
// --- Streaming API (Web TransformStream) ---
export { createUnxz, createXz } from './wasm/stream.js';

// --- Constants & types ---
export {
  LZMA_BUF_ERROR,
  LZMA_CHECK_CRC32,
  LZMA_CHECK_CRC64,
  LZMA_CHECK_NONE,
  LZMA_CHECK_SHA256,
  LZMA_DATA_ERROR,
  LZMA_FINISH,
  LZMA_FORMAT_ERROR,
  LZMA_FULL_FLUSH,
  LZMA_GET_CHECK,
  LZMA_MEM_ERROR,
  LZMA_MEMLIMIT_ERROR,
  LZMA_NO_CHECK,
  LZMA_OK,
  LZMA_OPTIONS_ERROR,
  LZMA_PROG_ERROR,
  LZMA_RUN,
  LZMA_STREAM_END,
  LZMA_SYNC_FLUSH,
  LZMA_UNSUPPORTED_CHECK,
  type LZMAModule,
} from './wasm/types.js';
// --- Utility functions ---
export {
  easyDecoderMemusage,
  easyEncoderMemusage,
  isXZ,
  parseFileIndex,
  versionNumber,
  versionString,
  type XZFileIndex,
} from './wasm/utils.js';
