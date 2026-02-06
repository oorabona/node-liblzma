# Browser Usage Guide

node-liblzma v3.0.0+ provides full XZ/LZMA2 compression and decompression in the browser via WebAssembly. This guide covers setup, usage patterns, and bundler configuration.

> **[Live Demo](https://oorabona.github.io/node-liblzma/demo/)** — Try XZ compression in your browser. Source code in [`examples/browser/`](../examples/browser/).
>
> **[tar-xz Demo](https://oorabona.github.io/node-liblzma/tar-xz/)** — Create and extract tar.xz archives in your browser. Powered by the [`tar-xz`](https://www.npmjs.com/package/tar-xz) package.

## Quick Start

```typescript
import { xzAsync, unxzAsync } from 'node-liblzma';

// Compress
const compressed = await xzAsync('Hello from the browser!');

// Decompress
const decompressed = await unxzAsync(compressed);
console.log(new TextDecoder().decode(decompressed)); // "Hello from the browser!"
```

No extra configuration needed if your bundler supports the `browser` condition in `package.json` exports (Vite, Webpack 5, esbuild, Rollup all do).

## Import Modes

### Standard Import (recommended)

```typescript
import { xzAsync, unxzAsync, createXz, createUnxz, isXZ } from 'node-liblzma';
```

Bundlers resolve this to the WASM implementation in browser environments and the native addon in Node.js.

### Explicit WASM Import

```typescript
import { xzAsync, unxzAsync, initModule } from 'node-liblzma/wasm';
```

Forces WASM usage regardless of environment. Useful for Node.js when you don't want to install native build dependencies.

### Inline WASM Import (zero-config)

```typescript
import { ensureInlineInit, xzAsync, unxzAsync } from 'node-liblzma/inline';

// Initialize once (decodes base64-embedded WASM binary)
await ensureInlineInit();

// Then use normally
const compressed = await xzAsync(data);
```

The inline mode embeds the WASM binary as base64 directly in the JavaScript bundle. No external `.wasm` file needs to be served. Trade-off: ~70KB larger JS bundle vs ~52KB external WASM fetch.

## API Reference

### Buffer API

```typescript
// Compress — accepts string, Uint8Array, or ArrayBuffer
const compressed = await xzAsync(input, { preset: 6 });

// Decompress
const decompressed = await unxzAsync(compressed);

// Callback style
xz(input, (err, result) => { /* ... */ });
unxz(compressed, (err, result) => { /* ... */ });
```

Options:
- `preset`: Compression level 0-6 (default: 6). Higher = smaller output, more CPU/memory.
- `check`: Integrity check type (default: CRC64).

### Streaming API

```typescript
import { initModule, createXz, createUnxz } from 'node-liblzma';

// Initialize the WASM module first (required before using any API)
await initModule();

// Returns a standard Web TransformStream<Uint8Array, Uint8Array>
const xzStream = createXz({ preset: 3 });
const unxzStream = createUnxz();

// Use with fetch, File API, etc.
const response = await fetch('/data.bin');
const compressed = response.body.pipeThrough(createXz());

// Pipe decompression
const decompressedStream = compressedStream.pipeThrough(createUnxz());
```

> **Note:** `initModule()` must be called once before using any WASM function. See [Custom WASM Loading](#custom-wasm-loading) for advanced initialization.

### Utility Functions

```typescript
import { isXZ, versionString, versionNumber, parseFileIndex } from 'node-liblzma';

// Check if data is XZ-compressed
isXZ(buffer); // true/false

// liblzma version
versionString(); // "5.8.2"
versionNumber(); // 50080020

// Parse XZ file metadata
const info = parseFileIndex(xzData);
// { uncompressedSize, compressedSize, streamCount, blockCount, check, memoryUsage }
```

### Custom WASM Loading

```typescript
import { initModule } from 'node-liblzma/wasm';

// Custom loader — e.g., load from CDN or service worker cache
await initModule(async () => {
  const wasmUrl = 'https://cdn.example.com/liblzma.wasm';
  const response = await fetch(wasmUrl);
  const wasmBinary = await response.arrayBuffer();

  const { default: createLZMA } = await import('node-liblzma/wasm/liblzma.js');
  return await createLZMA({ wasmBinary });
});
```

## Bundler Configuration

### Vite

Works out of the box. Vite reads the `browser` condition from `package.json` exports.

```typescript
// vite.config.ts — no special config needed
import { defineConfig } from 'vite';
export default defineConfig({});
```

### Webpack 5

Webpack 5 supports conditional exports. Ensure `browser` condition is enabled (default):

```javascript
// webpack.config.js
module.exports = {
  resolve: {
    conditionNames: ['browser', 'import', 'default'],
  },
  experiments: {
    asyncWebAssembly: true, // For WASM file loading
  },
};
```

### esbuild

```bash
esbuild app.js --bundle --platform=browser --conditions=browser
```

## Browser Compatibility

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 57+ | Full support |
| Firefox | 52+ | Full support |
| Safari | 11+ | Full support |
| Edge | 16+ | Full support |

Requirements:
- WebAssembly support
- ES2020 (async/await, BigInt)
- Web Streams API (for `createXz`/`createUnxz`)

## Limitations

### Sync APIs Not Available

`xzSync()` and `unxzSync()` throw `LZMAError` in browsers. WASM cannot do synchronous I/O. Use `xzAsync()` / `unxzAsync()` instead.

### Compression Presets 7-9

Presets 7-9 require more memory than the WASM default maximum (256MB). Use presets 0-6 in the browser. Preset 6 (default) provides excellent compression for most use cases.

### No Filesystem Operations

`xzFile()` and `unxzFile()` are not available in browsers. Use the File API or fetch API to read files, then compress/decompress the buffers.

### No Node.js Streams

The browser version uses Web `TransformStream` instead of Node.js `Transform` streams. The `Xz` and `Unxz` classes (Node Transform wrappers) are not exported.

## Performance: Native vs WASM

The WASM backend uses the same liblzma library as the native addon. Compression ratios are identical — the difference is only in speed.

| Metric | Native (C++ addon) | WASM | Notes |
|--------|-------------------|------|-------|
| Compress speed | Baseline | ~1x on data >100KB, 2-3x slower on tiny files | Near-parity at scale |
| Decompress speed | Baseline | 2-5x slower | Native is highly optimized |
| Compressed size | Baseline | Identical | Same liblzma algorithm |
| Presets supported | 0-9 | 0-6 | Presets 7-9 exceed WASM 256MB limit |
| Cross-compatible | Yes | Yes | Native output decompresses in WASM and vice versa |

To benchmark on your machine:

```bash
nxz --benchmark yourfile.txt
```

For the full comparison including system `xz`, see the [Benchmark section](../README.md#benchmark) in the README.

## Bundle Size

| Component | Raw | Gzipped |
|-----------|-----|---------|
| liblzma.wasm | ~107KB | ~52KB |
| Glue code | ~6KB | ~2KB |
| **Total** | **~113KB** | **~54KB** |

The inline mode adds ~70KB to the JS bundle (base64-encoded WASM) but eliminates the external WASM fetch.

## Migration from v2.x

If you're upgrading from v2.x to v3.0.0:

1. **No breaking changes for Node.js users** — The native addon API is unchanged.
2. **New browser support** — Import from `node-liblzma` in browser bundlers to get the WASM implementation automatically.
3. **Package exports** — The `exports` field in `package.json` now includes `browser`, `./wasm`, and `./inline` conditions.
