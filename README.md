Node-liblzma
==========

[![NPM Version](https://img.shields.io/npm/v/node-liblzma.svg)](https://npmjs.org/package/node-liblzma)
[![NPM Downloads](https://img.shields.io/npm/dm/node-liblzma.svg)](https://npmjs.org/package/node-liblzma)
[![CI Status](https://github.com/oorabona/node-liblzma/actions/workflows/ci-unified.yml/badge.svg)](https://github.com/oorabona/node-liblzma/actions/workflows/ci-unified.yml)
[![Code Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](#testing)

# What is liblzma/XZ ?

[XZ](https://tukaani.org/xz/xz-file-format.txt) is a container for compressed archives. It is among the best compressors out there according to several benchmarks:

* [Gzip vs Bzip2 vs LZMA vs XZ vs LZ4 vs LZO](http://pokecraft.first-world.info/wiki/Quick_Benchmark:_Gzip_vs_Bzip2_vs_LZMA_vs_XZ_vs_LZ4_vs_LZO)
* [Large Text Compression Benchmark](http://mattmahoney.net/dc/text.html#2118)
* [Linux Compression Comparison (GZIP vs BZIP2 vs LZMA vs ZIP vs Compress)](http://bashitout.com/2009/08/30/Linux-Compression-Comparison-GZIP-vs-BZIP2-vs-LZMA-vs-ZIP-vs-Compress.html)

It has a good balance between compression time/ratio and decompression time/memory.

# About this project

This project aims towards providing:

* A quick and easy way to play with XZ compression:
Quick and easy as it conforms to zlib API, so that switching from __zlib/deflate__ to __xz__ might be as easy as a string search/replace in your code editor :smile:

* Complete integration with XZ sources/binaries:
You can either use system packages or download a specific version and compile it!
See [installation](#installation) below.

> Only LZMA2 is supported for compression output.
But the library can open and read any LZMA1 or LZMA2 compressed file.

# What's new ?

## Version 2.0 (2025) - Complete Modernization

This major release brings the library into 2025 with modern tooling and TypeScript support:

* **Full TypeScript migration**: Complete rewrite from CoffeeScript to TypeScript for better type safety and developer experience
* **Promise-based APIs**: New async functions `xzAsync()` and `unxzAsync()` with Promise support
* **Modern testing**: Migrated from Mocha to Vitest with improved performance and better TypeScript integration
* **Enhanced tooling**: 
  - [Biome](https://biomejs.dev/) for fast linting and formatting
  - Pre-commit hooks with nano-staged and simple-git-hooks
  - pnpm as package manager for better dependency management
* **Updated Node.js support**: Requires Node.js >= 16 (updated from >= 12)

## Legacy (N-API migration)

In previous versions, [N-API](https://nodejs.org/api/n-api.html) became the _de facto_ standard to provide stable ABI API for NodeJS Native Modules, replacing [nan](https://github.com/nodejs/nan).

It has been tested and works on:

* Linux x64 (Ubuntu)
* OSX (`macos-11`)
* Raspberry Pi 2/3/4 (both on 32-bit and 64-bit architectures)
* Windows (`windows-2019` and `windows-2022` are part of GitHub CI)

> Notes:
>
> * For [Windows](https://github.com/oorabona/node-liblzma/actions/workflows/ci-windows.yml)
> There is no "global" installation of the LZMA library on the Windows machine provisionned by GitHub, so it is pointless to build with this config
>
* For [Linux](https://github.com/oorabona/node-liblzma/actions/workflows/ci-linux.yml)

* For [MacOS](https://github.com/oorabona/node-liblzma/actions/workflows/ci-macos.yml)

## Prebuilt images

Several prebuilt versions are bundled within the package.

* Windows x86_64
* Linux x86_64
* MacOS x86_64 / Arm64

If your OS/architecture matches, you will use this version which has been compiled using the following default flags:

Flag | Description | Default value | Possible values
-----|-------------|---------------|----------------
USE_GLOBAL | Should the library use the system provided DLL/.so library ? | `yes` (`no` if OS is Windows) | `yes` or `no`
RUNTIME_LINK | Should the library be linked statically or use the shared LZMA library ? | `shared` | `static` or `shared`
ENABLE_THREAD_SUPPORT | Does the LZMA library support threads ? | `yes` | `yes` or `no`

If not `node-gyp` will automagically start compiling stuff according to the environment variables set, or the default values above.

If you want to change compilation flags, please read on [here](#installation).

# Related projects

Thanks to the community, there are several choices out there:

* [lzma-purejs](https://github.com/cscott/lzma-purejs)
A pure JavaScript implementation of the algorithm
* [node-xz](https://github.com/robey/node-xz)
Node binding of XZ library
* [lzma-native](https://github.com/addaleax/lzma-native)
A very complete implementation of XZ library bindings
* Others are also available but they fork "xz" process in the background.

# API comparison

```js
// CommonJS
var lzma = require('node-liblzma');

// TypeScript / ES6 modules
import * as lzma from 'node-liblzma';
```

Zlib            | XZlib                   | Arguments
----------------|-------------------------|---------------
createGzip      | createXz                | ([lzma_options, [options]])
createGunzip    | createUnxz              | ([lzma_options, [options]])
gzip            | xz                      | (buf, [options], callback)
gunzip          | unxz                    | (buf, [options], callback)
gzipSync        | xzSync                  | (buf, [options])
gunzipSync      | unxzSync                | (buf, [options])
-               | xzAsync                 | (buf, [options]) ⇒ Promise\<Buffer>
-               | unxzAsync               | (buf, [options]) ⇒ Promise\<Buffer>

## Constants

`options` is an `Object` with the following possible attributes:

Attribute            | Type     | Available options
---------------------|----------|------------
check                | Uint32   | NONE
 | |CRC32
 | |CRC64
 | |SHA256
preset | Uint32 | DEFAULT
 | |EXTREME
flag | Uint32 | TELL_NO_CHECK
 | |TELL_UNSUPPORTED_CHECK
 | |TELL_ANY_CHECK
 | |CONCATENATED
mode | Uint32 | FAST
 | |NORMAL
filters | Array | LZMA2 (added by default)
 | |X86
 | |POWERPC
 | |IA64
 | |ARM
 | |ARMTHUMB
 | |SPARC

For further information about each of these flags, you will find reference at [XZ SDK](http://7-zip.org/sdk.html).

## Advanced Configuration

### Thread Support

The library supports multi-threaded compression when built with `ENABLE_THREAD_SUPPORT=yes` (default). Thread support allows parallel compression on multi-core systems, significantly improving performance for large files.

**Using threads in compression:**

```typescript
import { xz, createXz } from 'node-liblzma';

// Specify number of threads (1-N, where N is CPU core count)
const options = {
  preset: lzma.preset.DEFAULT,
  threads: 4  // Use 4 threads for compression
};

// With buffer compression
xz(buffer, options, (err, compressed) => {
  // ...
});

// With streams
const compressor = createXz(options);
inputStream.pipe(compressor).pipe(outputStream);
```

**Important notes:**
- Thread support only applies to **compression**, not decompression
- Requires LZMA library built with pthread support
- `threads: 1` disables multi-threading (falls back to single-threaded encoder)
- Check if threads are available: `import { hasThreads } from 'node-liblzma';`

### Buffer Size Optimization

For optimal performance, the library uses configurable chunk sizes:

```typescript
const stream = createXz({
  preset: lzma.preset.DEFAULT,
  chunkSize: 256 * 1024  // 256KB chunks (default: 64KB)
});
```

**Recommendations:**
- **Small files (< 1MB)**: Use default 64KB chunks
- **Medium files (1-10MB)**: Use 128-256KB chunks
- **Large files (> 10MB)**: Use 512KB-1MB chunks
- **Maximum buffer size**: 512MB per operation (security limit)

### Memory Usage Limits

The library enforces a 512MB maximum buffer size to prevent DoS attacks via resource exhaustion. For files larger than 512MB, use streaming APIs:

```typescript
import { createReadStream, createWriteStream } from 'fs';
import { createXz } from 'node-liblzma';

createReadStream('large-file.bin')
  .pipe(createXz())
  .pipe(createWriteStream('large-file.xz'));
```

### Error Handling

The library provides typed error classes for better error handling:

```typescript
import {
  xzAsync,
  LZMAError,
  LZMAMemoryError,
  LZMADataError,
  LZMAFormatError
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
  } else {
    console.error('Unknown error:', error);
  }
}
```

**Available error classes:**
- `LZMAError` - Base error class
- `LZMAMemoryError` - Memory allocation failed
- `LZMAMemoryLimitError` - Memory limit exceeded
- `LZMAFormatError` - Unrecognized file format
- `LZMAOptionsError` - Invalid compression options
- `LZMADataError` - Corrupt compressed data
- `LZMABufferError` - Buffer size issues
- `LZMAProgrammingError` - Internal errors

### Error Recovery

Streams automatically handle recoverable errors and provide state transition hooks:

```typescript
const decompressor = createUnxz();

decompressor.on('error', (error) => {
  console.error('Decompression error:', error.errno, error.message);
  // Stream will emit 'close' event after error
});

decompressor.on('close', () => {
  console.log('Stream closed, safe to cleanup');
});
```

### Concurrency Control with LZMAPool

For production environments with high concurrency needs, use `LZMAPool` to limit simultaneous operations:

```typescript
import { LZMAPool } from 'node-liblzma';

const pool = new LZMAPool(10); // Max 10 concurrent operations

// Monitor pool metrics
pool.on('metrics', (metrics) => {
  console.log(`Active: ${metrics.active}, Queued: ${metrics.queued}`);
  console.log(`Completed: ${metrics.completed}, Failed: ${metrics.failed}`);
});

// Compress with automatic queuing
const compressed = await pool.compress(buffer);
const decompressed = await pool.decompress(compressed);

// Get current metrics
const status = pool.getMetrics();
```

**Pool Events:**
- `queue` - Task added to queue
- `start` - Task started processing
- `complete` - Task completed successfully
- `error-task` - Task failed
- `metrics` - Metrics updated (after each state change)

**Benefits:**
- ✅ Automatic backpressure
- ✅ Prevents resource exhaustion
- ✅ Production-ready monitoring
- ✅ Zero breaking changes (opt-in)

### File Compression Helpers

Simplified API for file-based compression:

```typescript
import { xzFile, unxzFile } from 'node-liblzma';

// Compress a file
await xzFile('input.txt', 'output.txt.xz');

// Decompress a file
await unxzFile('output.txt.xz', 'restored.txt');

// With options
await xzFile('large-file.bin', 'compressed.xz', {
  preset: 9,
  threads: 4
});
```

**Advantages over buffer APIs:**
- ✅ Handles files > 512MB automatically
- ✅ Built-in backpressure via streams
- ✅ Lower memory footprint
- ✅ Simpler API for common use cases

## Async callback contract (errno-based)

The low-level native callback used internally by streams follows an errno-style contract to match liblzma behavior and to avoid mixing exception channels:

- Signature: `(errno: number, availInAfter: number, availOutAfter: number)`
- Success: `errno` is either `LZMA_OK` or `LZMA_STREAM_END`.
- Recoverable/other conditions: any other `errno` value (for example, `LZMA_BUF_ERROR`, `LZMA_DATA_ERROR`, `LZMA_PROG_ERROR`) indicates an error state.
- Streams emit `onerror` with the numeric `errno` when `errno !== LZMA_OK && errno !== LZMA_STREAM_END`.

Why errno instead of JS exceptions?

- The binding mirrors liblzma’s status codes and keeps a single error channel that’s easy to reason about in tight processing loops.
- This avoids throwing across async worker boundaries and keeps cleanup deterministic.

High-level APIs remain ergonomic:

- Promise-based functions `xzAsync()`/`unxzAsync()` still resolve to `Buffer` or reject with `Error` as expected.
- Stream users can listen to `error` events, where we map `errno` to a human-friendly message (`messages[errno]`).

If you prefer Node’s error-first callbacks, you can wrap the APIs and translate `errno` to `Error` objects at your boundaries without changing the native layer.

# Installation

Well, as simple as this one-liner:

```sh
npm i node-liblzma --save
```

--OR--

```sh
yarn add node-liblzma
```

--OR-- (recommended for development)

```sh
pnpm add node-liblzma
```

If you want to recompile the source, for example to disable threading support in the module, then you have to opt out with:

``` bash
ENABLE_THREAD_SUPPORT=no npm install node-liblzma --build-from-source
```

> Note:
Enabling thread support in the library will __NOT__ work if the LZMA library itself has been built without such support.

To build the module, you have the following options:

1. Using system development libraries
2. Ask the build system to download `xz` and build it
3. Compile `xz` yourself, outside `node-liblzma`, and have it use it after

## Using system dev libraries to compile

You need to have the development package installed on your system. If you have Debian based distro:

```
# apt-get install liblzma-dev
```

## Automatic download and compilation to statically link `xz`

If you do not plan on having a local install, you can ask for automatic download and build of whatever version of `xz` you want.

Just do:

```sh
npm install node-liblzma --build-from-source
```

When no option is given in the commandline arguments, it will build with default values.

## Local install of `xz` sources (outside `node-liblzma`)

So you did install `xz` somewhere outside the module and want the module to use it.

For that, you need to set the include directory and library directory search paths as GCC [environment variables](https://gcc.gnu.org/onlinedocs/gcc/Environment-Variables.html).

```sh
export CPATH=$HOME/path/to/headers
export LIBRARY_PATH=$HOME/path/to/lib
export LD_LIBRARY_PATH=$HOME/path/to/lib:$LD_LIBRARY_PATH
```

The latest is needed for tests to be run right after.

Once done, this should suffice:

```sh
npm install
```

# Testing

This project maintains **100% code coverage** across all statements, branches, functions, and lines.

You can run tests with:

```sh
npm test
# or
pnpm test
```

It will build and launch the test suite (51 tests) with [Vitest](https://vitest.dev/) with TypeScript support and coverage reporting.

Additional testing commands:

```sh
# Watch mode for development
pnpm test:watch

# Coverage report
pnpm test:coverage

# Type checking
pnpm type-check
```

# Usage

As the API is very close to NodeJS Zlib, you will probably find a good reference
[there](http://www.nodejs.org/api/zlib.html).

Otherwise examples can be found as part of the test suite, so feel free to use them!
They are written in TypeScript with full type definitions.

# Migration Guide

## Migrating from v1.x to v2.0

Version 2.0 introduces several breaking changes along with powerful new features.

### Breaking Changes

1. **Node.js Version Requirement**
   ```diff
   - Requires Node.js >= 12
   + Requires Node.js >= 16
   ```

2. **ESM Module Format**
   ```diff
   - CommonJS: var lzma = require('node-liblzma');
   + ESM: import * as lzma from 'node-liblzma';
   + CommonJS still works via dynamic import
   ```

3. **TypeScript Migration**
   - Source code migrated from CoffeeScript to TypeScript
   - Full type definitions included
   - Better IDE autocomplete and type safety

### New Features You Should Adopt

1. **Promise-based APIs** (Recommended for new code)
   ```typescript
   // Old callback style (still works)
   xz(buffer, (err, compressed) => {
     if (err) throw err;
     // use compressed
   });

   // New Promise style
   try {
     const compressed = await xzAsync(buffer);
     // use compressed
   } catch (err) {
     // handle error
   }
   ```

2. **Typed Error Classes** (Better error handling)
   ```typescript
   import { LZMAMemoryError, LZMADataError } from 'node-liblzma';

   try {
     await unxzAsync(corruptData);
   } catch (error) {
     if (error instanceof LZMADataError) {
       console.error('Corrupt compressed data');
     } else if (error instanceof LZMAMemoryError) {
       console.error('Out of memory');
     }
   }
   ```

3. **Concurrency Control** (For high-throughput applications)
   ```typescript
   import { LZMAPool } from 'node-liblzma';

   const pool = new LZMAPool(10); // Max 10 concurrent operations

   // Automatic queuing and backpressure
   const results = await Promise.all(
     files.map(file => pool.compress(file))
   );
   ```

4. **File Helpers** (Simpler file compression)
   ```typescript
   import { xzFile, unxzFile } from 'node-liblzma';

   // Compress a file (handles streaming automatically)
   await xzFile('input.txt', 'output.txt.xz');

   // Decompress a file
   await unxzFile('output.txt.xz', 'restored.txt');
   ```

### Testing Framework Change

If you maintain tests for code using node-liblzma:

```diff
- Mocha test framework
+ Vitest test framework (faster, better TypeScript support)
```

### Tooling Updates

Development tooling has been modernized:

- **Linter**: Biome (replaces ESLint + Prettier)
- **Package Manager**: pnpm recommended (npm/yarn still work)
- **Pre-commit Hooks**: nano-staged + simple-git-hooks

# Troubleshooting

## Common Build Issues

### Issue: "Cannot find liblzma library"

**Solution**: Install system development package or let node-gyp download it:

```bash
# Debian/Ubuntu
sudo apt-get install liblzma-dev

# macOS
brew install xz

# Windows (let node-gyp download and build)
npm install node-liblzma --build-from-source
```

### Issue: "node-gyp rebuild failed"

**Symptoms**: Build fails with C++ compilation errors

**Solutions**:
1. Install build tools:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install build-essential python3

   # macOS (install Xcode Command Line Tools)
   xcode-select --install

   # Windows
   npm install --global windows-build-tools
   ```

2. Clear build cache and retry:
   ```bash
   rm -rf build node_modules
   npm install
   ```

### Issue: "Prebuilt binary not found"

**Solution**: Your platform might not have prebuilt binaries. Build from source:

```bash
npm install node-liblzma --build-from-source
```

## Runtime Issues

### Issue: "Memory allocation failed" (LZMAMemoryError)

**Causes**:
- Input buffer exceeds 512MB limit (security protection)
- System out of memory
- Trying to decompress extremely large archive

**Solutions**:
1. For files > 512MB, use streaming APIs:
   ```typescript
   import { createReadStream, createWriteStream } from 'fs';
   import { createXz } from 'node-liblzma';

   createReadStream('large-file.bin')
     .pipe(createXz())
     .pipe(createWriteStream('large-file.xz'));
   ```

2. Or use file helpers (automatically handle large files):
   ```typescript
   await xzFile('large-file.bin', 'large-file.xz');
   ```

### Issue: "Corrupt compressed data" (LZMADataError)

**Symptoms**: Decompression fails with `LZMADataError`

**Causes**:
- File is not actually XZ/LZMA compressed
- File is corrupted or incomplete
- Wrong file format (LZMA1 vs LZMA2)

**Solutions**:
1. Verify file format:
   ```bash
   file compressed.xz
   # Should show: "XZ compressed data"
   ```

2. Check file integrity:
   ```bash
   xz -t compressed.xz
   ```

3. Handle errors gracefully:
   ```typescript
   try {
     const data = await unxzAsync(buffer);
   } catch (error) {
     if (error instanceof LZMADataError) {
       console.error('Invalid or corrupt XZ file');
     }
   }
   ```

### Issue: Thread support warnings during compilation

**Symptoms**: Compiler warnings about `-Wmissing-field-initializers`

**Status**: This is normal and does not affect functionality. Thread support still works correctly.

**Disable thread support** (if warnings are problematic):
```bash
ENABLE_THREAD_SUPPORT=no npm install node-liblzma --build-from-source
```

## Performance Issues

### Issue: Compression is slow on multi-core systems

**Solution**: Enable multi-threaded compression:

```typescript
import { xz } from 'node-liblzma';

xz(buffer, { threads: 4 }, (err, compressed) => {
  // 4 threads used for compression
});
```

**Note**: Threads only apply to compression, not decompression.

### Issue: High memory usage with concurrent operations

**Solution**: Use `LZMAPool` to limit concurrency:

```typescript
import { LZMAPool } from 'node-liblzma';

const pool = new LZMAPool(5); // Limit to 5 concurrent operations

// Pool automatically queues excess operations
const results = await Promise.all(
  largeArray.map(item => pool.compress(item))
);
```

## Windows-Specific Issues

### Issue: Build fails on Windows

**Solutions**:
1. Install Visual Studio Build Tools:
   ```powershell
   npm install --global windows-build-tools
   ```

2. Use the correct Python version:
   ```powershell
   npm config set python python3
   ```

3. Let the build system download XZ automatically:
   ```powershell
   npm install node-liblzma --build-from-source
   ```

### Issue: "Cannot find module" on Windows

**Cause**: Path separator issues in Windows

**Solution**: Use forward slashes or `path.join()`:
```typescript
import { join } from 'path';
await xzFile(join('data', 'input.txt'), join('data', 'output.xz'));
```

# Contributing

We welcome contributions! Here's how to get started.

## Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/oorabona/node-liblzma.git
   cd node-liblzma
   ```

2. **Install dependencies** (pnpm recommended):
   ```bash
   pnpm install
   # or
   npm install
   ```

3. **Build the project**:
   ```bash
   pnpm build
   ```

4. **Run tests**:
   ```bash
   pnpm test
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode (re-run on changes)
pnpm test:watch

# Coverage report
pnpm test:coverage

# Interactive UI
pnpm test:ui
```

### Code Quality

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check code style
pnpm check

# Auto-fix issues
pnpm check:write

# Lint only
pnpm lint

# Format only
pnpm format:write
```

### Type Checking

```bash
pnpm type-check
```

## Code Style

- **Linter**: Biome (configured in `biome.json`)
- **Formatting**: Biome handles both linting and formatting
- **Pre-commit hooks**: Automatically run via nano-staged + simple-git-hooks
- **TypeScript**: Strict mode enabled

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes
- `perf`: Performance improvements

**Examples**:
```bash
git commit -m "feat(pool): add LZMAPool for concurrency control"
git commit -m "fix(bindings): resolve memory leak in FunctionReference"
git commit -m "docs(readme): add migration guide for v2.0"
```

## Pull Request Process

1. **Fork the repository** and create a feature branch:
   ```bash
   git checkout -b feat/my-new-feature
   ```

2. **Make your changes** following code style guidelines

3. **Add tests** for new functionality:
   - All new code must have 100% test coverage
   - Tests go in `test/` directory
   - Use Vitest testing framework

4. **Ensure all checks pass**:
   ```bash
   pnpm check:write   # Fix code style
   pnpm type-check    # Verify TypeScript types
   pnpm test          # Run test suite
   ```

5. **Commit with conventional commits**:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

6. **Push and create Pull Request**:
   ```bash
   git push origin feat/my-new-feature
   ```

7. **Wait for CI checks** to pass (GitHub Actions will run automatically)

## Testing Guidelines

- **Coverage**: Maintain 100% code coverage (statements, branches, functions, lines)
- **Test files**: Name tests `*.test.ts` in `test/` directory
- **Structure**: Use `describe` and `it` blocks with clear descriptions
- **Assertions**: Use Vitest's `expect()` API

**Example test**:
```typescript
import { describe, it, expect } from 'vitest';
import { xzAsync, unxzAsync } from '../src/lzma.js';

describe('Compression', () => {
  it('should compress and decompress data', async () => {
    const original = Buffer.from('test data');
    const compressed = await xzAsync(original);
    const decompressed = await unxzAsync(compressed);

    expect(decompressed.equals(original)).toBe(true);
  });
});
```

## Release Process

Releases are automated using [@oorabona/release-it-preset](https://github.com/oorabona/release-it-preset):

```bash
# Standard release (patch/minor/major based on commits)
pnpm release

# Manual changelog editing
pnpm release:manual

# Hotfix release
pnpm release:hotfix

# Update changelog only (no release)
pnpm changelog:update
```

**For maintainers only**. Contributors should submit PRs; maintainers handle releases.

## Getting Help

- **Questions**: Open a [Discussion](https://github.com/oorabona/node-liblzma/discussions)
- **Bugs**: Open an [Issue](https://github.com/oorabona/node-liblzma/issues)
- **Security**: Email security@example.com (do not open public issues)

## License

By contributing, you agree that your contributions will be licensed under [LGPL-3.0+](LICENSE).

# Bugs

If you find one, feel free to contribute and post a new issue!
PR are accepted as well :)

Kudos goes to [addaleax](https://github.com/addaleax) for helping me out with C++ stuff !

If you compile with threads, you may see a bunch of warnings about `-Wmissing-field-initializers`.
This is _normal_ and does not prevent threading from being active and working.
I did not yet figure how to fix this except by masking the warning..

# License

This software is released under [LGPL3.0+](LICENSE)
