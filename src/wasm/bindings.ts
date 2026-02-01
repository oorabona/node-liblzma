/**
 * TypeScript bindings for the Emscripten-compiled liblzma WASM module.
 *
 * Provides typed wrappers around the raw C functions exported by liblzma.wasm,
 * with proper memory management and error handling.
 */

import { createLZMAError, LZMAError } from '../errors.js';
import { copyFromWasm, copyToWasm, type WasmLzmaStream, wasmAlloc, wasmFree } from './memory.js';
import {
  LZMA_BUF_ERROR,
  LZMA_CHECK_CRC64,
  LZMA_FINISH,
  LZMA_OK,
  LZMA_RUN,
  LZMA_STREAM_END,
  type LZMAModule,
} from './types.js';

// Default output buffer size for streaming operations (256KB)
const DEFAULT_OUT_BUF_SIZE = 256 * 1024;
// Maximum memory limit for decoder (256MB, matching WASM max)
const DEFAULT_MEMLIMIT = BigInt(256 * 1024 * 1024);

/** Singleton module instance (lazy-initialized) */
let moduleInstance: LZMAModule | null = null;
let modulePromise: Promise<LZMAModule> | null = null;

/**
 * Initialize the WASM module. Must be called before any operation.
 *
 * The module is loaded once and cached. Subsequent calls return
 * the same instance. Can be called with a custom loader for
 * inline/bundled WASM scenarios.
 *
 * @param loader - Optional custom module loader (for inline WASM)
 * @returns The initialized Emscripten module
 */
export async function initModule(loader?: () => Promise<LZMAModule>): Promise<LZMAModule> {
  if (moduleInstance) {
    return moduleInstance;
  }
  if (modulePromise) {
    return modulePromise;
  }

  modulePromise = (async () => {
    if (loader) {
      moduleInstance = await loader();
    } else {
      // Dynamic import of the Emscripten glue code
      const { default: createLZMA } = await import('./liblzma.js');
      moduleInstance = (await createLZMA()) as LZMAModule;
    }
    return moduleInstance;
  })();

  try {
    return await modulePromise;
  } catch (err) {
    modulePromise = null;
    throw new LZMAError(
      `Failed to load WASM module: ${err instanceof Error ? err.message : String(err)}`,
      -1
    );
  }
}

/**
 * Get the initialized module, throwing if not yet loaded.
 */
export function getModule(): LZMAModule {
  if (!moduleInstance) {
    throw new LZMAError('WASM module not initialized. Call initModule() first.', -1);
  }
  return moduleInstance;
}

/**
 * Reset module state (for testing purposes).
 */
export function resetModule(): void {
  moduleInstance = null;
  modulePromise = null;
}

// --- Encoding ---

/**
 * Initialize an easy encoder on the given lzma_stream.
 *
 * @param stream - Allocated WasmLzmaStream
 * @param preset - Compression preset (0-9, optionally OR'd with EXTREME flag)
 * @param check - Integrity check type (default: CRC64)
 * @throws LZMAError on initialization failure
 */
export function encoderInit(
  stream: WasmLzmaStream,
  preset: number,
  check = LZMA_CHECK_CRC64
): void {
  const module = getModule();
  const ret = module._lzma_easy_encoder(stream.ptr, preset, check);
  if (ret !== LZMA_OK) {
    throw createLZMAError(ret);
  }
}

/**
 * Initialize a stream decoder on the given lzma_stream.
 *
 * @param stream - Allocated WasmLzmaStream
 * @param memlimit - Memory limit in bytes (default: 256MB)
 * @throws LZMAError on initialization failure
 */
export function decoderInit(
  stream: WasmLzmaStream,
  memlimit: number | bigint = DEFAULT_MEMLIMIT
): void {
  const module = getModule();
  const limit = typeof memlimit === 'number' ? BigInt(memlimit) : memlimit;
  const ret = module._lzma_stream_decoder(stream.ptr, limit, 0);
  if (ret !== LZMA_OK) {
    throw createLZMAError(ret);
  }
}

/**
 * Initialize an auto decoder (detects format) on the given lzma_stream.
 *
 * @param stream - Allocated WasmLzmaStream
 * @param memlimit - Memory limit in bytes (default: 256MB)
 * @throws LZMAError on initialization failure
 */
export function autoDecoderInit(
  stream: WasmLzmaStream,
  memlimit: number | bigint = DEFAULT_MEMLIMIT
): void {
  const module = getModule();
  const limit = typeof memlimit === 'number' ? BigInt(memlimit) : memlimit;
  const ret = module._lzma_auto_decoder(stream.ptr, limit, 0);
  if (ret !== LZMA_OK) {
    throw createLZMAError(ret);
  }
}

/**
 * Run lzma_code on a stream (one step of encoding/decoding).
 *
 * @param stream - Active WasmLzmaStream
 * @param action - LZMA_RUN, LZMA_FINISH, etc.
 * @returns The lzma return code (LZMA_OK, LZMA_STREAM_END, or error)
 */
export function code(stream: WasmLzmaStream, action: number): number {
  const module = getModule();
  return module._lzma_code(stream.ptr, action);
}

/**
 * Finalize a stream and free its internal resources.
 */
export function end(stream: WasmLzmaStream): void {
  const module = getModule();
  module._lzma_end(stream.ptr);
}

/**
 * Get the memory usage of a stream (in bytes).
 */
export function memusage(stream: WasmLzmaStream): number {
  const module = getModule();
  return Number(module._lzma_memusage(stream.ptr));
}

// --- Buffer API (one-shot) ---

/**
 * Compress a buffer using lzma_easy_buffer_encode.
 *
 * @param input - Data to compress
 * @param preset - Compression preset (0-9)
 * @param check - Integrity check type (default: CRC64)
 * @returns Compressed data
 * @throws LZMAError on compression failure
 */
export function easyBufferEncode(
  input: Uint8Array,
  preset: number,
  check = LZMA_CHECK_CRC64
): Uint8Array {
  const module = getModule();

  const inPtr = copyToWasm(module, input);
  // Worst case: XZ header (12) + block header (~32) + data + padding + index + footer
  // For incompressible data, output can be slightly larger than input
  const outSize = input.byteLength + 1024;
  const outPtr = wasmAlloc(module, outSize);
  const outPosPtr = wasmAlloc(module, 4);

  try {
    // outPos starts at 0
    module.setValue(outPosPtr, 0, 'i32');

    const ret = module._lzma_easy_buffer_encode(
      preset,
      check,
      0, // allocator (NULL = default)
      inPtr,
      input.byteLength,
      outPtr,
      outPosPtr,
      outSize
    );

    if (ret !== LZMA_OK) {
      throw createLZMAError(ret);
    }

    const outPos = module.getValue(outPosPtr, 'i32');
    return copyFromWasm(module, outPtr, outPos);
  } finally {
    wasmFree(module, inPtr);
    wasmFree(module, outPtr);
    wasmFree(module, outPosPtr);
  }
}

/**
 * Decompress a buffer using lzma_stream_buffer_decode.
 *
 * @param input - XZ compressed data
 * @param memlimit - Memory limit in bytes (default: 256MB)
 * @returns Decompressed data
 * @throws LZMAError on decompression failure
 */
export function streamBufferDecode(
  input: Uint8Array,
  memlimit: number | bigint = DEFAULT_MEMLIMIT
): Uint8Array {
  const module = getModule();

  const inPtr = copyToWasm(module, input);
  const inPosPtr = wasmAlloc(module, 4);
  const outPosPtr = wasmAlloc(module, 4);
  const memlimitPtr = wasmAlloc(module, 8);

  // Start with 4x input size as estimate, will grow if needed
  let outSize = input.byteLength * 4;
  if (outSize < 4096) outSize = 4096;
  let outPtr = wasmAlloc(module, outSize);

  try {
    const limit = typeof memlimit === 'number' ? BigInt(memlimit) : memlimit;
    module.setValue(memlimitPtr, limit, 'i64');

    // Retry with larger buffer if BUF_ERROR
    for (let attempt = 0; attempt < 5; attempt++) {
      module.setValue(inPosPtr, 0, 'i32');
      module.setValue(outPosPtr, 0, 'i32');

      const ret = module._lzma_stream_buffer_decode(
        memlimitPtr,
        0, // flags
        0, // allocator (NULL)
        inPtr,
        inPosPtr,
        input.byteLength,
        outPtr,
        outPosPtr,
        outSize
      );

      if (ret === LZMA_OK) {
        const outPos = module.getValue(outPosPtr, 'i32');
        return copyFromWasm(module, outPtr, outPos);
      }

      // Buffer too small — grow and retry
      if (ret === LZMA_BUF_ERROR) {
        wasmFree(module, outPtr);
        outSize *= 4;
        outPtr = wasmAlloc(module, outSize);
        continue;
      }

      throw createLZMAError(ret);
    }

    throw new LZMAError('Decompression failed: output buffer exhausted', 10);
  } finally {
    wasmFree(module, inPtr);
    wasmFree(module, outPtr);
    wasmFree(module, inPosPtr);
    wasmFree(module, outPosPtr);
    wasmFree(module, memlimitPtr);
  }
}

// --- Streaming helpers ---

/**
 * Process a full input buffer through an initialized encoder/decoder stream,
 * collecting all output chunks.
 *
 * This is used by the buffer APIs (xzAsync/unxzAsync) for streaming
 * encoding/decoding within a single call.
 *
 * @param stream - Initialized WasmLzmaStream (encoder or decoder)
 * @param input - Input data
 * @returns Concatenated output
 * @throws LZMAError on processing failure
 */
export function processStream(stream: WasmLzmaStream, input: Uint8Array): Uint8Array {
  const module = getModule();

  const inPtr = copyToWasm(module, input);
  const outBufSize = DEFAULT_OUT_BUF_SIZE;
  const outPtr = wasmAlloc(module, outBufSize);

  try {
    stream.setInput(inPtr, input.byteLength);

    const chunks: Uint8Array[] = [];
    let action = LZMA_RUN;

    while (true) {
      // Once all input consumed, switch to FINISH
      if (stream.availIn === 0) {
        action = LZMA_FINISH;
      }

      stream.setOutput(outPtr, outBufSize);
      const ret = code(stream, action);

      // Collect output produced
      const produced = outBufSize - stream.availOut;
      if (produced > 0) {
        chunks.push(copyFromWasm(module, outPtr, produced));
      }

      if (ret === LZMA_STREAM_END) {
        break;
      }

      if (ret !== LZMA_OK) {
        throw createLZMAError(ret);
      }
    }

    // Concatenate all output chunks
    const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } finally {
    wasmFree(module, inPtr);
    wasmFree(module, outPtr);
    end(stream);
    stream.free();
  }
}

// --- Utility bindings ---

/**
 * Get the liblzma version string (e.g. "5.6.3").
 */
export function versionString(): string {
  const module = getModule();
  const ptr = module._lzma_version_string();
  // Read null-terminated C string from WASM memory
  const bytes = module.HEAPU8;
  let end = ptr;
  while (bytes[end] !== 0) end++;
  const decoder = new TextDecoder();
  return decoder.decode(bytes.subarray(ptr, end));
}

/**
 * Check if a given integrity check type is supported.
 */
export function checkIsSupported(check: number): boolean {
  const module = getModule();
  return module._lzma_check_is_supported(check) !== 0;
}
