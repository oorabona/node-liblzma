Node-liblzma
==========

[![NPM Version](https://img.shields.io/npm/v/node-liblzma.svg)](https://npmjs.org/package/node-liblzma)
[![NPM Downloads](https://img.shields.io/npm/dm/node-liblzma.svg)](https://npmjs.org/package/node-liblzma)
[![CI Status](https://github.com/oorabona/node-liblzma/actions/workflows/ci.yml/badge.svg)](https://github.com/oorabona/node-liblzma/actions/workflows/ci.yml)
[![Documentation](https://img.shields.io/badge/docs-TypeDoc-blue.svg)](https://oorabona.github.io/node-liblzma/)
[![License](https://img.shields.io/npm/l/node-liblzma.svg)](https://github.com/oorabona/node-liblzma/blob/master/LICENSE)
[![Node Version](https://img.shields.io/node/v/node-liblzma.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![npm provenance](https://img.shields.io/badge/npm-provenance-green.svg)](https://docs.npmjs.com/generating-provenance-statements)
[![codecov](https://codecov.io/gh/oorabona/node-liblzma/graph/badge.svg)](https://codecov.io/gh/oorabona/node-liblzma)
[![code style: biome](https://img.shields.io/badge/code_style-biome-60a5fa.svg)](https://biomejs.dev)

Native Node.js bindings for liblzma — XZ/LZMA2 compression with **browser support via WebAssembly**.

## Table of Contents

- [Quick Start](#quick-start)
- [What's New](#whats-new)
  - [v3.0.0 — Browser & WASM Support](#v300--browser--wasm-support)
  - [v2.0.0 — TypeScript Modernization](#v200--typescript-modernization)
- [Browser Usage](#browser-usage)
- [CLI Tool (nxz)](#cli-tool-nxz)
- [API Reference](#api-reference)
  - [API Comparison with Zlib](#api-comparison-with-zlib)
  - [Options](#options)
- [Advanced Configuration](#advanced-configuration)
  - [Thread Support](#thread-support)
  - [Progress Monitoring](#progress-monitoring)
  - [Concurrency Control (LZMAPool)](#concurrency-control-with-lzmapool)
  - [File Compression Helpers](#file-compression-helpers)
  - [Error Handling](#error-handling)
- [Benchmark](#benchmark)
- [Installation](#installation)
- [Testing](#testing)
- [Migration Guide (v1 → v2)](#migration-guide)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [Bugs](#bugs)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## What is liblzma/XZ?

[XZ](https://tukaani.org/xz/xz-file-format.txt) is a container for compressed archives. It offers one of the best compression ratios available, with a good balance between compression time and decompression speed/memory.

> Only LZMA2 is supported for compression output.
> But the library can open and read any LZMA1 or LZMA2 compressed file.

## Quick Start

```bash
npm install node-liblzma
```

```typescript
import { xzAsync, unxzAsync, createXz, createUnxz } from 'node-liblzma';

// Simple: Compress a buffer
const compressed = await xzAsync(Buffer.from('Hello, World!'));
const decompressed = await unxzAsync(compressed);

// Streaming: Compress a file
import { createReadStream, createWriteStream } from 'fs';

createReadStream('input.txt')
  .pipe(createXz())
  .pipe(createWriteStream('output.xz'));

// With progress monitoring
const compressor = createXz();
compressor.on('progress', ({ bytesRead, bytesWritten }) => {
  console.log(`${bytesRead} bytes in → ${bytesWritten} bytes out`);
});
```

<details>
<summary><strong>Promise style (with .then())</strong></summary>

```typescript
import { xzAsync, unxzAsync } from 'node-liblzma';

xzAsync(Buffer.from('Hello, World!'))
  .then(compressed => {
    console.log('Compressed size:', compressed.length);
    return unxzAsync(compressed);
  })
  .then(decompressed => {
    console.log('Decompressed:', decompressed.toString());
  })
  .catch(err => {
    console.error('Compression failed:', err);
  });
```

</details>

<details>
<summary><strong>Callback style (Node.js traditional)</strong></summary>

```typescript
import { xz, unxz } from 'node-liblzma';

xz(Buffer.from('Hello, World!'), (err, compressed) => {
  if (err) throw err;
  unxz(compressed, (err, decompressed) => {
    if (err) throw err;
    console.log('Decompressed:', decompressed.toString());
  });
});
```

</details>

📖 **Full API documentation**: [oorabona.github.io/node-liblzma](https://oorabona.github.io/node-liblzma/)

## What's New

### v3.0.0 — Browser & WASM Support

> **[Live Demo](https://oorabona.github.io/node-liblzma/demo/)** — Try XZ compression in your browser.

- **Browser/WASM support**: Full XZ compression and decompression via WebAssembly
  - Same API as Node.js (`xzAsync`, `unxzAsync`, `createXz`, `createUnxz`)
  - WASM binary: ~52KB gzipped (under 100KB budget)
  - Web Streams API for streaming compression/decompression
  - Zero-config inline mode: `import from 'node-liblzma/inline'`
- **CLI tool (nxz)**: Portable xz-like command line tool
  - Full xz compatibility: `-z`, `-d`, `-l`, `-k`, `-f`, `-c`, `-o`, `-v`, `-q`
  - Compression presets 0-9 with extreme mode (`-e`)
  - Progress display, stdin/stdout piping, benchmarking (`-B`)
- **Progress events**: Monitor compression/decompression in real-time
- **XZ Utils 5.8.x**: Updated to latest stable version
- **458+ tests**: Comprehensive test suite with 100% code coverage

### v2.0.0 — TypeScript Modernization

- **Full TypeScript migration**: Complete rewrite from CoffeeScript
- **Promise-based APIs**: `xzAsync()` and `unxzAsync()`
- **Modern tooling**: Vitest, Biome, pnpm, pre-commit hooks
- **Node.js >= 16** required (updated from >= 12)

<details>
<summary><strong>Legacy (N-API migration)</strong></summary>

In previous versions, [N-API](https://nodejs.org/api/n-api.html) replaced [nan](https://github.com/nodejs/nan) as the stable ABI for native modules.

Tested on: Linux x64, macOS (x64/arm64), Raspberry Pi 2/3/4, Windows.

**Prebuilt binaries** are bundled for: Windows x64, Linux x64, macOS x64/arm64.

| Flag | Description | Default | Values |
|------|-------------|---------|--------|
| `USE_GLOBAL` | Use system liblzma library | `yes` (`no` on Windows) | `yes`, `no` |
| `RUNTIME_LINK` | Static or shared linking | `shared` | `static`, `shared` |
| `ENABLE_THREAD_SUPPORT` | Enable thread support | `yes` | `yes`, `no` |

If no prebuilt binary matches your platform, `node-gyp` will compile from source automatically.

</details>

## Browser Usage

> **[Live Demo](https://oorabona.github.io/node-liblzma/demo/)** — Try XZ compression in your browser right now.

node-liblzma v3.0.0+ supports XZ compression in the browser via WebAssembly. The same API works in both Node.js and browsers — bundlers (Vite, Webpack, esbuild) automatically resolve the WASM-backed implementation.

### Basic Usage

```typescript
// Bundlers auto-resolve to WASM in browser, native in Node.js
import { xzAsync, unxzAsync, isXZ } from 'node-liblzma';

// Compress
const compressed = await xzAsync('Hello, browser!');

// Decompress
const original = await unxzAsync(compressed);

// Check if data is XZ-compressed
if (isXZ(someBuffer)) {
  const data = await unxzAsync(someBuffer);
}
```

### Streaming with Web Streams API

```typescript
import { createXz, createUnxz } from 'node-liblzma';

// Compress a fetch response
const response = await fetch('/large-file.bin');
const compressed = response.body.pipeThrough(createXz({ preset: 6 }));

// Decompress
const decompressed = compressedStream.pipeThrough(createUnxz());
```

### Import Modes

| Import | When to use |
|--------|-------------|
| `node-liblzma` | Standard — bundler resolves to WASM (browser) or native (Node.js) |
| `node-liblzma/wasm` | Explicit WASM usage in Node.js (no native addon needed) |
| `node-liblzma/inline` | Zero-config — WASM embedded as base64 (no external file to serve) |

```typescript
// Explicit WASM (works in Node.js too, no native build required)
import { xzAsync } from 'node-liblzma/wasm';

// Inline mode (larger bundle, but no WASM file to configure)
import { ensureInlineInit, xzAsync } from 'node-liblzma/inline';
await ensureInlineInit(); // Decodes embedded base64 WASM
const compressed = await xzAsync(data);
```

### Browser Limitations

- **No sync APIs**: `xzSync()` / `unxzSync()` throw `LZMAError` in browsers
- **Presets 0-6 only**: Presets 7-9 require more memory than WASM's 256MB limit
- **No filesystem**: `xzFile()` / `unxzFile()` are not available
- **No Node Streams**: Use `createXz()` / `createUnxz()` (Web TransformStream) instead of `Xz` / `Unxz` classes

### Bundle Size

| Component | Raw | Gzipped |
|-----------|-----|---------|
| liblzma.wasm | ~107KB | ~52KB |
| Glue code (liblzma.js) | ~6KB | ~2KB |
| **Total** | **~113KB** | **~54KB** |

For detailed browser setup instructions, see [docs/BROWSER.md](docs/BROWSER.md).

## CLI Tool (nxz)

This package includes `nxz`, a portable xz-like CLI tool that works on any platform with Node.js.

### Installation

```bash
# Global installation (recommended for CLI usage)
npm install -g node-liblzma

# Then use directly
nxz --help
```

### Quick Examples

```bash
# Compress a file (creates file.txt.xz, deletes original)
nxz file.txt

# Decompress (auto-detected from .xz extension)
nxz file.txt.xz

# Keep original file (-k)
nxz -k file.txt

# Maximum compression (-9) with extreme mode (-e)
nxz -9e large-file.bin

# Compress to stdout (-c) for piping
nxz -c file.txt > file.txt.xz

# List archive info (-l / -lv for verbose)
nxz -l file.txt.xz

# Benchmark native vs WASM performance (-B)
nxz -B file.txt
```

### All Options

| Option | Long | Description |
|--------|------|-------------|
| `-z` | `--compress` | Force compression mode |
| `-d` | `--decompress` | Force decompression mode |
| `-l` | `--list` | List archive information |
| `-B` | `--benchmark` | Benchmark native vs WASM performance |
| `-k` | `--keep` | Keep original file (don't delete) |
| `-f` | `--force` | Overwrite existing output file |
| `-c` | `--stdout` | Write to stdout, keep original file |
| `-o` | `--output=FILE` | Write output to specified file |
| `-v` | `--verbose` | Show progress for large files |
| `-q` | `--quiet` | Suppress warning messages |
| `-0`..`-9` | | Compression level (default: 6) |
| `-e` | `--extreme` | Extreme compression (slower) |
| `-h` | `--help` | Show help |
| `-V` | `--version` | Show version |

<details>
<summary><strong>One-shot usage (without global install)</strong></summary>

```bash
# npm/npx
npx --package node-liblzma nxz --help

# pnpm
pnpm dlx --package node-liblzma nxz --help
```

</details>

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (file not found, format error, etc.) |
| 130 | Interrupted (SIGINT/Ctrl+C) |

## API Reference

### API Comparison with Zlib

The API mirrors Node.js Zlib for easy adoption:

```js
// CommonJS
var lzma = require('node-liblzma');

// TypeScript / ES6 modules
import * as lzma from 'node-liblzma';
```

| Zlib | node-liblzma | Arguments |
|------|--------------|-----------|
| `createGzip` | `createXz` | `([options])` |
| `createGunzip` | `createUnxz` | `([options])` |
| `gzip` | `xz` | `(buf, [options], callback)` |
| `gunzip` | `unxz` | `(buf, [options], callback)` |
| `gzipSync` | `xzSync` | `(buf, [options])` |
| `gunzipSync` | `unxzSync` | `(buf, [options])` |
| - | `xzAsync` | `(buf, [options])` → `Promise<Buffer>` |
| - | `unxzAsync` | `(buf, [options])` → `Promise<Buffer>` |
| - | `xzFile` | `(input, output, [options])` → `Promise<void>` |
| - | `unxzFile` | `(input, output, [options])` → `Promise<void>` |

### Options

| Attribute | Type | Description | Values |
|-----------|------|-------------|--------|
| `check` | number | Integrity check | `check.NONE`, `check.CRC32`, `check.CRC64`, `check.SHA256` |
| `preset` | number | Compression level (0-9) | `preset.DEFAULT` (6), `preset.EXTREME` |
| `mode` | number | Compression mode | `mode.FAST`, `mode.NORMAL` |
| `threads` | number | Thread count | `0` = auto (all cores), `1` = single-threaded, `N` = N threads |
| `filters` | array | Filter chain | `filter.LZMA2`, `filter.X86`, `filter.ARM`, etc. |
| `chunkSize` | number | Processing chunk size | Default: 64KB |

For further information, see the [XZ SDK documentation](http://7-zip.org/sdk.html).

## Advanced Configuration

### Thread Support

Multi-threaded compression is available when built with `ENABLE_THREAD_SUPPORT=yes` (default).

| Value | Behavior |
|-------|----------|
| `0` | **Auto-detect**: use all available CPU cores |
| `1` | Single-threaded (default) |
| `N` | Use exactly N threads |

```typescript
import { createXz, hasThreads } from 'node-liblzma';

if (hasThreads()) {
  const compressor = createXz({ threads: 0 }); // auto-detect
}
```

> **Note**: Threads only apply to compression, not decompression.

### Progress Monitoring

Track compression and decompression progress in real-time:

```typescript
import { createXz, createUnxz } from 'node-liblzma';

const compressor = createXz({ preset: 6 });

compressor.on('progress', ({ bytesRead, bytesWritten }) => {
  const ratio = bytesWritten / bytesRead;
  console.log(`Progress: ${bytesRead} in, ${bytesWritten} out (ratio: ${ratio.toFixed(2)})`);
});

inputStream.pipe(compressor).pipe(outputStream);
```

Progress events fire after each chunk is processed. Works with streams, not buffer APIs.

### Concurrency Control with LZMAPool

For production environments with high concurrency needs:

```typescript
import { LZMAPool } from 'node-liblzma';

const pool = new LZMAPool(10); // Max 10 concurrent operations

pool.on('metrics', (metrics) => {
  console.log(`Active: ${metrics.active}, Queued: ${metrics.queued}`);
});

const compressed = await pool.compress(buffer);
const decompressed = await pool.decompress(compressed);
```

### File Compression Helpers

```typescript
import { xzFile, unxzFile } from 'node-liblzma';

await xzFile('input.txt', 'output.txt.xz');
await unxzFile('output.txt.xz', 'restored.txt');

// With options
await xzFile('large-file.bin', 'compressed.xz', { preset: 9, threads: 4 });
```

Handles files > 512MB automatically via streams with lower memory footprint.

### Error Handling

Typed error classes for precise error handling:

```typescript
import {
  xzAsync, LZMAError, LZMAMemoryError, LZMADataError, LZMAFormatError
} from 'node-liblzma';

try {
  const compressed = await xzAsync(buffer);
} catch (error) {
  if (error instanceof LZMAMemoryError) {
    console.error('Out of memory:', error.message);
  } else if (error instanceof LZMADataError) {
    console.error('Corrupt data:', error.message);
  } else if (error instanceof LZMAFormatError) {
    console.error('Invalid format:', error.message);
  }
}
```

**Available error classes**: `LZMAError` (base), `LZMAMemoryError`, `LZMAMemoryLimitError`, `LZMAFormatError`, `LZMAOptionsError`, `LZMADataError`, `LZMABufferError`, `LZMAProgrammingError`.

### Buffer Size Optimization

```typescript
const stream = createXz({
  preset: lzma.preset.DEFAULT,
  chunkSize: 256 * 1024  // 256KB chunks (default: 64KB)
});
```

| File Size | Recommended chunkSize |
|-----------|-----------------------|
| < 1MB | 64KB (default) |
| 1-10MB | 128-256KB |
| > 10MB | 512KB-1MB |

Maximum buffer size: 512MB per operation (security limit). For larger files, use streaming APIs.

### Async Callback Contract (errno-based)

The low-level native callback follows an errno-style contract matching liblzma behavior:

- **Signature**: `(errno: number, availInAfter: number, availOutAfter: number)`
- **Success**: `errno` is `LZMA_OK` or `LZMA_STREAM_END`
- **Error**: any other `errno` value

High-level APIs remain ergonomic — Promise functions resolve to `Buffer` or reject with `Error`, stream users listen to `error` events.

## Benchmark

### Performance Hierarchy

All three backends use the same liblzma library and produce **identical compression ratios**:

```
System xz  >  nxz native (C++ addon)  >  nxz WASM (Emscripten)
 fastest        ~1-2x slower               ~2-5x slower (decompress)
                                           ~1x (compress, large files)
```

### Full Comparison (246 KB source code, preset 6)

| Backend | Compress | Decompress | Size | Environment |
|---------|----------|------------|------|-------------|
| **System `xz` 5.8** | 81 ms | 4 ms | 76.7 KB | C binary |
| **nxz native** | 90 ms | 3.4 ms | 76.7 KB | Node.js + C++ addon |
| **nxz WASM** | 86 ms | 7.9 ms | 76.7 KB | Node.js + Emscripten |

### Native vs WASM (nxz -B, preset 6)

| Data | Compress | Decompress | Notes |
|------|----------|------------|-------|
| 1 KB text | WASM 2.8x slower | WASM 4.9x slower | Startup overhead dominates |
| 135 KB binary | ~1:1 | WASM 2x slower | Compression near-parity |
| 246 KB source | ~1:1 | WASM 2.3x slower | Realistic workload |
| 1 MB random | ~1:1 | WASM 1.6x slower | Gap narrows with size |

<details>
<summary><strong>Running benchmarks</strong></summary>

```bash
# Compare nxz (native) vs system xz across file sizes
./scripts/benchmark.sh
./scripts/benchmark.sh -s 1,50,200 -p 6,9         # custom sizes/presets
./scripts/benchmark.sh -o csv > results.csv        # export as CSV/JSON

# Compare native addon vs WASM backend
nxz --benchmark file.txt
nxz -B -3 large-file.bin                           # with preset 3
```

</details>

### When to Use What

| Scenario | Recommended |
|----------|-------------|
| Browser | WASM (only option) |
| Node.js, performance-critical | Native addon |
| Node.js, no C++ toolchain available | WASM (`node-liblzma/wasm`) |
| Cross-platform scripts | nxz CLI |
| Batch processing many files | System xz |
| CI/CD with Node.js already installed | nxz CLI |

## Installation

```bash
npm install node-liblzma
# or
pnpm add node-liblzma
```

### System Libraries

If prebuilt binaries don't match your platform, install system development libraries:

```bash
# Debian/Ubuntu
sudo apt-get install liblzma-dev

# macOS
brew install xz

# Windows (automatic download and build)
npm install node-liblzma --build-from-source
```

### Build from Source

```bash
# Force rebuild with default options
npm install node-liblzma --build-from-source

# Disable thread support
ENABLE_THREAD_SUPPORT=no npm install node-liblzma --build-from-source
```

<details>
<summary><strong>Custom XZ installation</strong></summary>

If you compiled XZ outside of node-liblzma:

```bash
export CPATH=$HOME/path/to/headers
export LIBRARY_PATH=$HOME/path/to/lib
export LD_LIBRARY_PATH=$HOME/path/to/lib:$LD_LIBRARY_PATH
npm install
```

</details>

## Testing

```bash
pnpm test              # Run all 458+ tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
pnpm type-check        # TypeScript type checking
```

Tests use [Vitest](https://vitest.dev/) with 100% code coverage across statements, branches, functions, and lines.

## Migration Guide

### v1.x → v2.0

<details>
<summary><strong>Breaking changes and new features</strong></summary>

#### Breaking Changes

1. **Node.js >= 16** required (was >= 12)
2. **ESM module format** (`import` instead of `require`)
3. **TypeScript source** (CoffeeScript removed)

#### New Features

```typescript
// Promise-based APIs (recommended)
const compressed = await xzAsync(buffer);

// Typed error classes
import { LZMAMemoryError, LZMADataError } from 'node-liblzma';

// Concurrency control
const pool = new LZMAPool(10);
const results = await Promise.all(files.map(f => pool.compress(f)));

// File helpers
await xzFile('input.txt', 'output.txt.xz');
```

#### Tooling Changes

- **Linter**: Biome (replaces ESLint + Prettier)
- **Tests**: Vitest (replaces Mocha)
- **Package Manager**: pnpm recommended

</details>

## Contributing

We welcome contributions! See the full [contributing guidelines](#development-workflow) below.

### Development Setup

```bash
git clone https://github.com/oorabona/node-liblzma.git
cd node-liblzma
pnpm install
pnpm build
pnpm test
```

### Development Workflow

```bash
pnpm test              # Run tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
pnpm check             # Lint + format check (Biome)
pnpm check:write       # Auto-fix lint/format
pnpm type-check        # TypeScript types
```

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add LZMAPool for concurrency control
fix: resolve memory leak in FunctionReference
docs: add migration guide for v2.0
```

### Pull Request Process

1. Fork and create a feature branch (`feat/`, `fix/`, `refactor/`, `docs/`)
2. Add tests for new functionality (100% coverage required)
3. Run `pnpm check:write && pnpm type-check && pnpm test`
4. Commit with conventional commits and push
5. CI checks run automatically on PR

## Troubleshooting

<details>
<summary><strong>Build issues</strong></summary>

**"Cannot find liblzma library"** — Install system dev package:
```bash
sudo apt-get install liblzma-dev    # Debian/Ubuntu
brew install xz                     # macOS
```

**"node-gyp rebuild failed"** — Install build tools:
```bash
sudo apt-get install build-essential python3    # Linux
xcode-select --install                          # macOS
npm install --global windows-build-tools        # Windows
```

**"Prebuilt binary not found"** — Build from source:
```bash
npm install node-liblzma --build-from-source
```

</details>

<details>
<summary><strong>Runtime issues</strong></summary>

**LZMAMemoryError** — Input too large for buffer API. Use streaming:
```typescript
createReadStream('large.bin').pipe(createXz()).pipe(createWriteStream('large.xz'));
```

**LZMADataError** — File is not XZ-compressed or is corrupted. Verify with `file compressed.xz` or `xz -t compressed.xz`.

**Slow on multi-core** — Enable threads: `createXz({ threads: 0 })` (auto-detect cores).

**High memory with concurrency** — Use `LZMAPool` to limit simultaneous operations.

</details>

<details>
<summary><strong>Windows-specific</strong></summary>

**Build fails** — Install Visual Studio Build Tools and set Python:
```powershell
npm install --global windows-build-tools
npm config set python python3
```

**Path issues** — Use `path.join()` instead of hardcoded separators.

</details>

## Related Projects

- [lzma-purejs](https://github.com/cscott/lzma-purejs) — Pure JavaScript LZMA implementation
- [node-xz](https://github.com/robey/node-xz) — Node binding of XZ library
- [lzma-native](https://github.com/addaleax/lzma-native) — Complete XZ library bindings

## Bugs

If you find one, feel free to contribute and post a new [issue](https://github.com/oorabona/node-liblzma/issues)!
PRs are accepted as well :)

If you compile with threads, you may see warnings about `-Wmissing-field-initializers`.
This is normal and does not prevent threading from being active and working.

## Acknowledgements

Kudos to [addaleax](https://github.com/addaleax) for helping out with C++ stuff!

## License

This software is released under [LGPL-3.0+](LICENSE).
