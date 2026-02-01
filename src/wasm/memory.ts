/**
 * WASM memory management utilities for liblzma.
 *
 * Provides safe allocation/deallocation of WASM heap memory,
 * buffer transfers between JS and WASM, and lzma_stream struct management.
 */

import { LZMA_STREAM_OFFSETS, LZMA_STREAM_SIZE, type LZMAModule } from './types.js';

/**
 * Allocate a zeroed block on the WASM heap.
 * @throws Error if allocation fails (returns 0)
 */
export function wasmAlloc(module: LZMAModule, size: number): number {
  const ptr = module._malloc(size);
  if (ptr === 0) {
    throw new Error(`WASM malloc failed for ${size} bytes`);
  }
  // Zero the allocated memory
  module.HEAPU8.fill(0, ptr, ptr + size);
  return ptr;
}

/**
 * Free a WASM heap pointer. Safe to call with 0 (no-op).
 */
export function wasmFree(module: LZMAModule, ptr: number): void {
  if (ptr !== 0) {
    module._free(ptr);
  }
}

/**
 * Copy a JS Uint8Array into the WASM heap.
 * @returns Pointer to the allocated WASM memory containing the data.
 */
export function copyToWasm(module: LZMAModule, data: Uint8Array): number {
  const ptr = wasmAlloc(module, data.byteLength);
  module.HEAPU8.set(data, ptr);
  return ptr;
}

/**
 * Copy data from WASM heap into a new JS Uint8Array.
 */
export function copyFromWasm(module: LZMAModule, ptr: number, length: number): Uint8Array {
  return new Uint8Array(module.HEAPU8.buffer, ptr, length).slice();
}

/**
 * Manages an lzma_stream struct allocated on the WASM heap.
 *
 * The struct is allocated zeroed (equivalent to LZMA_STREAM_INIT in C).
 * Call `free()` when done to release the memory.
 */
export class WasmLzmaStream {
  readonly ptr: number;
  private readonly module: LZMAModule;
  private freed = false;

  constructor(module: LZMAModule) {
    this.module = module;
    this.ptr = wasmAlloc(module, LZMA_STREAM_SIZE);
  }

  /** Set the input buffer pointer and available bytes */
  setInput(bufPtr: number, size: number): void {
    this.module.setValue(this.ptr + LZMA_STREAM_OFFSETS.next_in, bufPtr, 'i32');
    this.module.setValue(this.ptr + LZMA_STREAM_OFFSETS.avail_in, size, 'i32');
  }

  /** Set the output buffer pointer and available bytes */
  setOutput(bufPtr: number, size: number): void {
    this.module.setValue(this.ptr + LZMA_STREAM_OFFSETS.next_out, bufPtr, 'i32');
    this.module.setValue(this.ptr + LZMA_STREAM_OFFSETS.avail_out, size, 'i32');
  }

  /** Get remaining available input bytes */
  get availIn(): number {
    return this.module.getValue(this.ptr + LZMA_STREAM_OFFSETS.avail_in, 'i32');
  }

  /** Get remaining available output bytes */
  get availOut(): number {
    return this.module.getValue(this.ptr + LZMA_STREAM_OFFSETS.avail_out, 'i32');
  }

  /** Get total bytes read from input */
  get totalIn(): number {
    // Read as two i32 values (low + high) since getValue doesn't support i64 well
    const low = this.module.getValue(this.ptr + LZMA_STREAM_OFFSETS.total_in, 'i32');
    const high = this.module.getValue(this.ptr + LZMA_STREAM_OFFSETS.total_in + 4, 'i32');
    return low + high * 0x100000000;
  }

  /** Get total bytes written to output */
  get totalOut(): number {
    const low = this.module.getValue(this.ptr + LZMA_STREAM_OFFSETS.total_out, 'i32');
    const high = this.module.getValue(this.ptr + LZMA_STREAM_OFFSETS.total_out + 4, 'i32');
    return low + high * 0x100000000;
  }

  /** Free the struct memory. Safe to call multiple times. */
  free(): void {
    if (!this.freed) {
      this.freed = true;
      wasmFree(this.module, this.ptr);
    }
  }
}

/**
 * RAII-style helper: allocate a WASM buffer, run a callback, then free it.
 * Ensures the buffer is freed even if the callback throws.
 */
export async function withWasmBuffer<T>(
  module: LZMAModule,
  size: number,
  fn: (ptr: number) => T | Promise<T>
): Promise<T> {
  const ptr = wasmAlloc(module, size);
  try {
    return await fn(ptr);
  } finally {
    wasmFree(module, ptr);
  }
}
