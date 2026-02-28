#!/bin/bash
# Build liblzma as WASM module for browser usage
# Part of node-liblzma Block 1: Emscripten Build Infrastructure
#
# Usage:
#   ./src/wasm/build.sh              # Full build
#   ./src/wasm/build.sh --size-only  # Skip build, report sizes
#
# Prerequisites:
#   - Emscripten SDK (emsdk) activated in PATH
#   - deps/xz checked out (git submodule)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LIBLZMA_SRC="$PROJECT_ROOT/deps/xz"
BUILD_DIR="$PROJECT_ROOT/build/wasm"
OUTPUT_DIR="$SCRIPT_DIR"

# Check Emscripten is available
if ! command -v emcc &>/dev/null; then
    echo "ERROR: Emscripten (emcc) not found in PATH."
    echo "Install: https://emscripten.org/docs/getting_started/downloads.html"
    echo "Or activate: source /path/to/emsdk/emsdk_env.sh"
    exit 1
fi

# Check deps/xz exists
if [ ! -f "$LIBLZMA_SRC/CMakeLists.txt" ]; then
    echo "ERROR: deps/xz not found. Run: git submodule update --init"
    exit 1
fi

# === Size report mode ===
if [ "${1:-}" = "--size-only" ]; then
    if [ ! -f "$OUTPUT_DIR/liblzma.wasm" ]; then
        echo "ERROR: No WASM output found. Run build first."
        exit 1
    fi
    exec "$SCRIPT_DIR/check-size.sh"
fi

echo "=== Building liblzma WASM module ==="
echo "Emscripten: $(emcc --version | head -1)"
echo ""

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

cd "$BUILD_DIR"

# === Step 1: Configure liblzma with CMake for Emscripten ===
echo "--- Configuring liblzma ---"
emcmake cmake "$LIBLZMA_SRC" \
    -DCMAKE_BUILD_TYPE=MinSizeRel \
    -DBUILD_SHARED_LIBS=OFF \
    -DENABLE_THREADS=OFF \
    -DENABLE_SMALL=ON \
    -DHAVE_ENCODERS=ON \
    -DHAVE_DECODERS=ON \
    -DENABLE_LZMA1=ON \
    -DENABLE_LZMA2=ON \
    -DENABLE_DELTA=ON \
    -DENABLE_X86=ON \
    -DENABLE_ARM=OFF \
    -DENABLE_ARM64=OFF \
    -DENABLE_ARMTHUMB=OFF \
    -DENABLE_POWERPC=OFF \
    -DENABLE_IA64=OFF \
    -DENABLE_SPARC=OFF \
    -DENABLE_RISCV=OFF \
    -DCMAKE_C_FLAGS="-Oz -flto" \
    2>&1

echo ""

# === Step 2: Build static library ===
echo "--- Building liblzma ---"
emmake make -j"$(nproc)" liblzma 2>&1

LIBLZMA_A=$(find . -name "liblzma.a" | head -1)
if [ -z "$LIBLZMA_A" ]; then
    echo "ERROR: liblzma.a not found after build"
    exit 1
fi
echo "Found: $LIBLZMA_A"
echo ""

# === Step 3: Link WASM module ===
echo "--- Creating WASM module ---"

# Exported liblzma C functions (matching the 15 used by N-API bindings)
EXPORTED_FUNCTIONS='[
    "_lzma_easy_encoder",
    "_lzma_stream_decoder",
    "_lzma_auto_decoder",
    "_lzma_code",
    "_lzma_end",
    "_lzma_memusage",
    "_lzma_memlimit_set",
    "_lzma_stream_buffer_encode",
    "_lzma_stream_buffer_decode",
    "_lzma_easy_buffer_encode",
    "_lzma_version_string",
    "_lzma_check_is_supported",
    "_lzma_index_decoder",
    "_lzma_index_end",
    "_lzma_index_uncompressed_size",
    "_malloc",
    "_free"
]'

# Remove whitespace for emcc
EXPORTED_FUNCTIONS=$(echo "$EXPORTED_FUNCTIONS" | tr -d ' \n')

emcc -Oz -flto \
    -I"$LIBLZMA_SRC/src/liblzma/api" \
    -s WASM=1 \
    -s FILESYSTEM=0 \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORT_NAME="createLZMA" \
    -s ENVIRONMENT='web,worker' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=1048576 \
    -s MAXIMUM_MEMORY=268435456 \
    -s STACK_SIZE=65536 \
    -s EXPORTED_FUNCTIONS="$EXPORTED_FUNCTIONS" \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8","setValue","getValue"]' \
    --closure 1 \
    "$LIBLZMA_A" \
    -o "$OUTPUT_DIR/liblzma.js"

echo ""
echo "=== Build complete ==="
echo "Output: $OUTPUT_DIR/liblzma.{js,wasm}"
echo ""

# === Step 4: Size validation ===
exec "$SCRIPT_DIR/check-size.sh"
