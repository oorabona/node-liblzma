/**
 * WASM-specific types for the Emscripten-compiled liblzma module.
 */

/** Emscripten module instance returned by createLZMA() */
export interface LZMAModule {
  // Memory access
  HEAPU8: Uint8Array;

  // Memory management
  _malloc(size: number): number;
  _free(ptr: number): void;

  // Value access (for struct fields)
  setValue(ptr: number, value: number | bigint, type: string): void;
  getValue(ptr: number, type: string): number;

  // Function call utilities
  ccall(ident: string, returnType: string | null, argTypes: string[], args: unknown[]): unknown;
  cwrap(
    ident: string,
    returnType: string | null,
    argTypes: string[]
  ): (...args: unknown[]) => unknown;

  // Exported liblzma functions
  // Note: uint64_t args/returns map to BigInt in WASM without WASM_BIGINT=0
  _lzma_easy_encoder(strm: number, preset: number, check: number): number;
  _lzma_stream_decoder(strm: number, memlimit: bigint): number;
  _lzma_auto_decoder(strm: number, memlimit: bigint): number;
  _lzma_code(strm: number, action: number): number;
  _lzma_end(strm: number): void;
  _lzma_memusage(strm: number): bigint;
  _lzma_memlimit_set(strm: number, memlimit: bigint): number;
  _lzma_stream_buffer_encode(
    filters: number,
    check: number,
    allocator: number,
    inBuf: number,
    inSize: number,
    outBuf: number,
    outPos: number,
    outSize: number
  ): number;
  _lzma_stream_buffer_decode(
    memlimit: number,
    flags: number,
    allocator: number,
    inBuf: number,
    inPos: number,
    inSize: number,
    outBuf: number,
    outPos: number,
    outSize: number
  ): number;
  _lzma_easy_buffer_encode(
    preset: number,
    check: number,
    allocator: number,
    inBuf: number,
    inSize: number,
    outBuf: number,
    outPos: number,
    outSize: number
  ): number;
  _lzma_version_string(): number;
  _lzma_check_is_supported(check: number): number;
  _lzma_index_decoder(strm: number, indexPtr: number, memlimit: bigint): number;
  _lzma_index_end(index: number, allocator: number): void;
  _lzma_index_uncompressed_size(index: number): bigint;
}

// --- LZMA Return Codes ---

export const LZMA_OK = 0;
export const LZMA_STREAM_END = 1;
export const LZMA_NO_CHECK = 2;
export const LZMA_UNSUPPORTED_CHECK = 3;
export const LZMA_GET_CHECK = 4;
export const LZMA_MEM_ERROR = 5;
export const LZMA_MEMLIMIT_ERROR = 6;
export const LZMA_FORMAT_ERROR = 7;
export const LZMA_OPTIONS_ERROR = 8;
export const LZMA_DATA_ERROR = 9;
export const LZMA_BUF_ERROR = 10;
export const LZMA_PROG_ERROR = 11;

// --- LZMA Actions ---

export const LZMA_RUN = 0;
export const LZMA_SYNC_FLUSH = 1;
export const LZMA_FULL_FLUSH = 2;
export const LZMA_FINISH = 3;

// --- Check Types ---

export const LZMA_CHECK_NONE = 0;
export const LZMA_CHECK_CRC32 = 1;
export const LZMA_CHECK_CRC64 = 4;
export const LZMA_CHECK_SHA256 = 10;

/**
 * Layout of lzma_stream struct in WASM32 memory.
 *
 * All offsets are for 32-bit Emscripten (WASM32):
 *   pointer = 4 bytes, size_t = 4 bytes, uint64_t = 8 bytes (8-byte aligned)
 */
export const LZMA_STREAM_OFFSETS = {
  next_in: 0, // const uint8_t* (4 bytes)
  avail_in: 4, // size_t (4 bytes)
  total_in: 8, // uint64_t (8 bytes, 8-byte aligned)
  next_out: 16, // uint8_t* (4 bytes)
  avail_out: 20, // size_t (4 bytes)
  total_out: 24, // uint64_t (8 bytes, 8-byte aligned)
  allocator: 32, // lzma_allocator* (4 bytes)
  internal: 36, // lzma_internal* (4 bytes)
  reserved_ptr1: 40,
  reserved_ptr2: 44,
  reserved_ptr3: 48,
  reserved_ptr4: 52,
  reserved_int1: 56, // uint64_t (8 bytes)
  reserved_int2: 64,
  reserved_int3: 72,
  reserved_int4: 80,
  reserved_enum1: 88, // lzma_reserved_enum (4 bytes)
  reserved_enum2: 92,
} as const;

/** Total size of lzma_stream struct in WASM32 */
export const LZMA_STREAM_SIZE = 96;
