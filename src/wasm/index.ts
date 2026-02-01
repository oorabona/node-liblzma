/**
 * WASM liblzma module — public API.
 *
 * This module provides TypeScript bindings to the Emscripten-compiled
 * liblzma WASM binary, enabling XZ/LZMA2 compression in browsers.
 */

// --- Block 2: Low-level bindings ---
export {
  autoDecoderInit,
  checkIsSupported,
  code,
  decoderInit,
  easyBufferEncode,
  encoderInit,
  end,
  getModule,
  initModule,
  memusage,
  processStream,
  resetModule,
  streamBufferDecode,
  versionString as wasmVersionString,
} from './bindings.js';
// --- Block 3: Buffer API (high-level) ---
export { xz, xzAsync, xzSync } from './compress.js';
export { unxz, unxzAsync, unxzSync } from './decompress.js';
export { copyFromWasm, copyToWasm, WasmLzmaStream } from './memory.js';
// --- Block 4: Streaming API (Web Streams) ---
export { createUnxz, createXz } from './stream.js';
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
} from './types.js';

// --- Block 5: Utility functions ---
export {
  easyDecoderMemusage,
  easyEncoderMemusage,
  isXZ,
  parseFileIndex,
  toUint8Array,
  versionNumber,
  versionString,
  type XZFileIndex,
} from './utils.js';
