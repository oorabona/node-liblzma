/**
 * Inline WASM entry point for node-liblzma.
 *
 * This module embeds the WASM binary as a base64 string, enabling
 * zero-config usage without needing to configure bundler WASM loading.
 *
 * Usage:
 *   import { xzAsync, unxzAsync } from 'node-liblzma/inline';
 *
 * Unlike the standard WASM entry point, initialization is NOT automatic.
 * Call `ensureInlineInit()` once before using any exported function.
 *
 * Trade-off: Larger JS bundle (~70KB base64 vs ~52KB binary fetch)
 * but no external file to serve and no fetch() required.
 */

import { initModule } from './wasm/bindings.js';
// The base64-encoded WASM binary is injected at build time.
// This import resolves to a generated file containing the base64 string.
import { WASM_BASE64 } from './wasm/liblzma.inline.js';
import type { LZMAModule } from './wasm/types.js';

let initialized = false;

/**
 * Ensures the WASM module is initialized with the inline binary.
 * Must be called once before using any other exported function.
 */
async function ensureInlineInit(): Promise<LZMAModule> {
  if (!initialized) {
    try {
      const module = await initModule(async () => {
        // Decode base64 to binary
        const binaryString = atob(WASM_BASE64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const wasmBinary = bytes.buffer;

        // Dynamically import the Emscripten glue
        const { default: createLZMA } = await import('./wasm/liblzma.js');
        return (await createLZMA({ wasmBinary })) as LZMAModule;
      });
      initialized = true;
      return module;
    } catch (err) {
      initialized = false;
      throw err;
    }
  }
  // Already initialized — return current module
  const { getModule } = await import('./wasm/bindings.js');
  return getModule();
}

// Re-export the full browser API — the inline init is triggered
// by calling ensureInlineInit() before first use.
export { ensureInlineInit };

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
