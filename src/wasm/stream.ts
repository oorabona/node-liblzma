/**
 * Web Streams API for WASM XZ compression/decompression.
 *
 * Returns standard Web TransformStream instances (not Node.js streams).
 * Use `.pipeThrough()` instead of `.pipe()`.
 */

import { createLZMAError } from '../errors.js';
import type { LZMAOptions } from '../types.js';
import { code, decoderInit, encoderInit, end, getModule } from './bindings.js';
import { copyFromWasm, copyToWasm, WasmLzmaStream, wasmAlloc, wasmFree } from './memory.js';
import { LZMA_CHECK_CRC64, LZMA_FINISH, LZMA_OK, LZMA_RUN, LZMA_STREAM_END } from './types.js';

// Chunk size for streaming I/O (64KB)
const CHUNK_SIZE = 64 * 1024;

/**
 * Create a Web TransformStream that compresses data to XZ format.
 *
 * @param opts - Compression options (preset, check)
 * @returns A TransformStream<Uint8Array, Uint8Array>
 *
 * @example
 * ```ts
 * const compressed = await new Response(
 *   readableStream.pipeThrough(createXz())
 * ).arrayBuffer();
 * ```
 */
export function createXz(opts?: LZMAOptions): TransformStream<Uint8Array, Uint8Array> {
  const preset = opts?.preset ?? 6;
  const checkType = opts?.check ?? LZMA_CHECK_CRC64;
  const module = getModule();

  const stream = new WasmLzmaStream(module);
  encoderInit(stream, preset, checkType);
  const outPtr = wasmAlloc(module, CHUNK_SIZE);

  let cleaned = false;
  const doCleanup = () => {
    if (!cleaned) {
      cleaned = true;
      cleanup(module, stream, outPtr);
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      processChunk(module, stream, outPtr, chunk, LZMA_RUN, controller);
    },
    flush(controller) {
      processChunk(module, stream, outPtr, new Uint8Array(0), LZMA_FINISH, controller);
      doCleanup();
    },
  });
}

/**
 * Create a Web TransformStream that decompresses XZ data.
 *
 * @returns A TransformStream<Uint8Array, Uint8Array>
 *
 * @example
 * ```ts
 * const decompressed = await new Response(
 *   xzStream.pipeThrough(createUnxz())
 * ).arrayBuffer();
 * ```
 */
export function createUnxz(): TransformStream<Uint8Array, Uint8Array> {
  const module = getModule();

  const stream = new WasmLzmaStream(module);
  decoderInit(stream);
  const outPtr = wasmAlloc(module, CHUNK_SIZE);
  let finished = false;
  let cleaned = false;
  const doCleanup = () => {
    if (!cleaned) {
      cleaned = true;
      cleanup(module, stream, outPtr);
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (finished) return;
      const done = processChunk(module, stream, outPtr, chunk, LZMA_RUN, controller);
      if (done) finished = true;
    },
    flush(controller) {
      if (!finished) {
        processChunk(module, stream, outPtr, new Uint8Array(0), LZMA_FINISH, controller);
      }
      doCleanup();
    },
  });
}

/**
 * Process a single chunk through the lzma stream, enqueueing output.
 * Returns true if LZMA_STREAM_END was reached.
 */
function processChunk(
  module: ReturnType<typeof getModule>,
  stream: WasmLzmaStream,
  outPtr: number,
  chunk: Uint8Array,
  action: number,
  controller: TransformStreamDefaultController<Uint8Array>
): boolean {
  let inPtr = 0;
  try {
    if (chunk.byteLength > 0) {
      inPtr = copyToWasm(module, chunk);
      stream.setInput(inPtr, chunk.byteLength);
    } else {
      stream.setInput(0, 0);
    }

    while (true) {
      stream.setOutput(outPtr, CHUNK_SIZE);
      const ret = code(stream, action);

      const produced = CHUNK_SIZE - stream.availOut;
      if (produced > 0) {
        controller.enqueue(copyFromWasm(module, outPtr, produced));
      }

      if (ret === LZMA_STREAM_END) {
        return true;
      }

      if (ret !== LZMA_OK) {
        throw createLZMAError(ret);
      }

      // If all input consumed and no more output, we're done with this chunk
      if (stream.availIn === 0 && stream.availOut > 0) {
        break;
      }
    }
    return false;
  } finally {
    if (inPtr) wasmFree(module, inPtr);
  }
}

/** Free WASM resources */
function cleanup(
  module: ReturnType<typeof getModule>,
  stream: WasmLzmaStream,
  outPtr: number
): void {
  end(stream);
  stream.free();
  wasmFree(module, outPtr);
}
