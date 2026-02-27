---
doc-meta:
  status: canonical
  scope: wasm-browser
  type: specification
  created: 2026-01-25
  updated: 2026-01-25
  complexity: ENTERPRISE
  time-budget: 3-4 weeks
---

# Specification: WASM Browser Support for node-liblzma

## 0. Quick Reference (ALWAYS VISIBLE)

| Item | Value |
|------|-------|
| Scope | wasm-browser |
| Complexity | ENTERPRISE |
| Time budget | 3-4 weeks |
| Blocks | 9 (includes Block 0 spike) |
| BDD scenarios | 21 |
| Risk level | HIGH → MEDIUM (Block 0 validated) |
| Target version | 3.0.0 |

### Key Decisions (Multi-LLM Review 2026-01-25)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sync APIs in browser | Throw runtime error | Keep API surface, fail clearly |
| Streaming API | Web Streams native | Modern standard, document difference |
| WASM loading | Two exports (fetch + inline) | `node-liblzma` = fetch, `node-liblzma/inline` = base64 |
| Size validation | Block 0 spike first | Validate < 100KB before full implementation |
| Byte-identical output | Same deps/xz for both | Pin liblzma version in native + WASM |

## 1. Problem Statement

No browser solution offers both XZ/LZMA2 **compression AND decompression**. Existing solutions (xzwasm, xz-decompress) only decompress. Web developers need client-side XZ compression for:
- Uploading compressed files
- PWAs with offline capabilities
- Web tools (converters, archive builders)
- Reducing bandwidth for large file transfers

## 2. User Stories

### US-01: Web Developer Using XZ Compression
```
AS A web developer
I WANT to compress data to XZ format in the browser
SO THAT I can upload smaller files and save bandwidth

ACCEPTANCE:
- Same API as Node.js version
- Bundle < 100KB gzipped
- Works in Chrome, Firefox, Safari, Edge
```

### US-02: Isomorphic Library User
```
AS A developer building isomorphic apps
I WANT node-liblzma to work transparently in Node and browser
SO THAT I can share compression code between server and client

ACCEPTANCE:
- Single import works everywhere
- Conditional exports auto-select correct implementation
- No code changes needed between environments
```

### US-03: Streaming Data Processor
```
AS A developer processing large files
I WANT streaming compression/decompression
SO THAT I don't run out of memory on large files

ACCEPTANCE:
- Web Streams API support (ReadableStream, TransformStream)
- Chunked processing without loading entire file
- Progress callbacks for UX feedback
```

## 3. Business Rules

### 3.1 Invariants (always true)
- INV-01: WASM and native implementations MUST produce byte-identical XZ output for same input and options
- INV-02: API signatures MUST be identical between Node and browser builds
- INV-03: Bundle size MUST stay under 100KB gzipped (WASM + JS glue)
- INV-04: WASM build MUST NOT include threading (no SharedArrayBuffer requirement)

### 3.2 Preconditions (required before action)
- PRE-01: Browser must support WebAssembly (Chrome 57+, Firefox 52+, Safari 11+, Edge 16+)
- PRE-02: For streaming API, browser must support Web Streams API
- PRE-03: WASM module must be loaded before any operation

### 3.3 Effects (what changes)
- EFF-01: `import { xz } from 'node-liblzma'` loads native in Node, WASM in browser
- EFF-02: New `browser` export condition in package.json
- EFF-03: Version bump to 3.0.0 (new capability, no breaking changes)

### 3.4 Error Handling
- ERR-01: When WASM not supported → throw `LZMAError` with clear message
- ERR-02: When WASM load fails → throw `LZMAError` with fetch/compile details
- ERR-03: When memory limit exceeded → throw `LZMAMemoryError` (same as native)
- ERR-04: When invalid XZ data → throw `LZMADataError` (same as native)

## 4. Technical Design

### 4.1 Architecture Decision

**Approach: Emscripten compilation of liblzma with JS wrapper**

```
deps/xz/src/liblzma/
        │
        ▼ (Emscripten)
src/wasm/
├── liblzma.wasm       # Compiled library (~60-80KB)
├── liblzma.js         # Emscripten glue code
└── bindings.ts        # TypeScript wrapper matching native API

src/
├── lzma.ts            # Existing (unchanged)
├── lzma.browser.ts    # Browser entry point (imports WASM)
└── lzma.node.ts       # Node entry point (imports native)
```

**Why Emscripten over AssemblyScript:**
- liblzma is battle-tested C code (20+ years)
- Reimplementing LZMA2 = 3-6 months + bug risk
- Emscripten handles memory management correctly

**Why NOT separate package:**
- Users prefer single install
- API must be identical
- Maintenance burden of 2 packages

### 4.2 File Structure Changes

| Path | Action | Description |
|------|--------|-------------|
| `src/wasm/` | Create | WASM bindings directory |
| `src/wasm/build.sh` | Create | Emscripten build script |
| `src/wasm/bindings.ts` | Create | TypeScript wrapper for WASM |
| `src/lzma.browser.ts` | Create | Browser entry point |
| `src/lzma.node.ts` | Create | Node entry point (re-export) |
| `package.json` | Modify | Add conditional exports |
| `tsconfig.json` | Modify | Multiple build targets |

### 4.3 Package.json Exports

```json
{
  "exports": {
    ".": {
      "browser": {
        "import": "./lib/lzma.browser.js",
        "types": "./lib/lzma.browser.d.ts"
      },
      "node": {
        "import": "./lib/lzma.node.js",
        "types": "./lib/lzma.node.d.ts"
      },
      "default": "./lib/lzma.node.js"
    },
    "./inline": {
      "browser": {
        "import": "./lib/lzma.browser.inline.js",
        "types": "./lib/lzma.browser.d.ts"
      },
      "default": "./lib/lzma.browser.inline.js"
    },
    "./wasm": {
      "import": "./lib/wasm/index.js",
      "types": "./lib/wasm/index.d.ts"
    }
  },
  "browser": {
    "./lib/lzma.node.js": "./lib/lzma.browser.js"
  }
}
```

**Import paths:**
- `node-liblzma` → Node native OR browser with external WASM fetch
- `node-liblzma/inline` → Browser with inline Base64 WASM (zero-config)
- `node-liblzma/wasm` → Direct WASM module access

### 4.4 API Mapping (Node → WASM)

| Node API | WASM Equivalent | Notes |
|----------|-----------------|-------|
| `createXz(opts)` | `createXz(opts)` | Returns Web TransformStream (not Node stream!) |
| `createUnxz(opts)` | `createUnxz(opts)` | Returns Web TransformStream |
| `xz(buffer, opts, cb)` | `xz(buffer, opts, cb)` | Callback-based |
| `xzSync(buffer, opts)` | `xzSync(buffer, opts)` | **Throws LZMAError in browser** |
| `xzAsync(buffer, opts)` | `xzAsync(buffer, opts)` | Promise-based |
| `unxz(buffer, opts, cb)` | `unxz(buffer, opts, cb)` | Callback-based |
| `unxzSync(buffer, opts)` | `unxzSync(buffer, opts)` | **Throws LZMAError in browser** |
| `unxzAsync(buffer, opts)` | `unxzAsync(buffer, opts)` | Promise-based |
| `isXZ(buffer)` | `isXZ(buffer)` | Format detection |
| `versionString()` | `versionString()` | liblzma version |
| `parseFileIndex(buffer)` | `parseFileIndex(buffer)` | XZ metadata |

**Important differences in browser:**
1. **Sync APIs throw:** `xzSync()` and `unxzSync()` exist in API but throw `LZMAError("Sync operations not supported in browser")` to avoid blocking the main thread
2. **Web Streams:** `createXz()` and `createUnxz()` return Web `TransformStream`, not Node `stream.Transform`. Use `.pipeThrough()` instead of `.pipe()`
3. **Buffer/Uint8Array:** APIs accept both `Buffer` and `Uint8Array` in browser

## 5. Acceptance Criteria (BDD)

### Scenario Group: Basic Compression

```gherkin
@priority:high @type:nominal
Scenario: SC-01 Compress buffer in browser
  Given a browser environment with WASM support
  And a 1KB text buffer
  When I call xzAsync(buffer)
  Then I receive a valid XZ compressed buffer
  And the output is decompressible by native xz tool

@priority:high @type:nominal
Scenario: SC-02 Decompress buffer in browser
  Given a browser environment with WASM support
  And a valid XZ compressed buffer
  When I call unxzAsync(buffer)
  Then I receive the original uncompressed data
  And it matches byte-for-byte

@priority:high @type:nominal
Scenario: SC-03 Compress with preset levels
  Given a browser environment with WASM support
  When I compress the same data with presets 0, 6, and 9
  Then preset 9 produces smaller output than preset 6
  And preset 6 produces smaller output than preset 0
```

### Scenario Group: Streaming API

```gherkin
@priority:high @type:nominal
Scenario: SC-04 Stream compression with TransformStream
  Given a browser environment with Web Streams support
  And a ReadableStream of 10MB data
  When I pipe through createXz()
  Then I receive a ReadableStream of XZ data
  And memory usage stays below 10MB (chunked processing)

@priority:high @type:nominal
Scenario: SC-05 Stream decompression
  Given a browser environment with Web Streams support
  And a ReadableStream of XZ data
  When I pipe through createUnxz()
  Then I receive the original uncompressed data as a stream

@priority:medium @type:edge
Scenario: SC-06 Cancel stream mid-processing
  Given a compression stream in progress
  When the consumer cancels the readable side
  Then the WASM resources are properly freed
  And no memory leak occurs
```

### Scenario Group: Conditional Exports

```gherkin
@priority:high @type:nominal
Scenario: SC-07 Auto-select WASM in browser bundler
  Given a project using Vite/Webpack/esbuild
  When I import { xzAsync } from 'node-liblzma'
  Then the bundler resolves to lzma.browser.js
  And WASM files are included in bundle

@priority:high @type:nominal
Scenario: SC-08 Auto-select native in Node.js
  Given a Node.js environment
  When I import { xzAsync } from 'node-liblzma'
  Then Node resolves to lzma.node.js
  And native binding is used (not WASM)

@priority:medium @type:edge
Scenario: SC-09 Explicit WASM import in Node
  Given a Node.js environment
  When I import from 'node-liblzma/wasm'
  Then WASM implementation is used
  And it produces identical output to native

@priority:high @type:nominal
Scenario: SC-09b Inline WASM import (zero-config)
  Given a browser environment without bundler config
  When I import from 'node-liblzma/inline'
  Then WASM is loaded from inline Base64
  And no external fetch is required
  And compression works immediately
```

### Scenario Group: Error Handling

```gherkin
@priority:high @type:error
Scenario: SC-10 WASM not supported
  Given a browser without WebAssembly support
  When I try to use any compression function
  Then I get a LZMAError with message "WebAssembly not supported"

@priority:high @type:error
Scenario: SC-10b Sync API throws in browser
  Given a browser environment with WASM loaded
  When I call xzSync(buffer)
  Then I get a LZMAError with message "Sync operations not supported in browser"
  And the error suggests using xzAsync instead

@priority:high @type:error
Scenario: SC-11 Invalid XZ data
  Given a browser with WASM loaded
  And a buffer containing invalid XZ data
  When I call unxzAsync(buffer)
  Then I get a LZMADataError
  And the error message indicates the corruption type

@priority:medium @type:error
Scenario: SC-12 Memory limit exceeded
  Given a browser with limited WASM memory
  When I try to compress with preset 9 on huge data
  Then I get a LZMAMemoryError
  And a suggestion to use lower preset
```

### Scenario Group: Compatibility

```gherkin
@priority:critical @type:nominal
Scenario: SC-13 Byte-identical output Node vs WASM
  Given identical input buffer and options
  When I compress with Node native binding
  And I compress with WASM in browser
  Then both outputs are byte-identical

@priority:high @type:nominal
Scenario: SC-14 Cross-decompress Node → WASM
  Given data compressed by native Node binding
  When I decompress with WASM in browser
  Then decompression succeeds
  And output matches original

@priority:high @type:nominal
Scenario: SC-15 Cross-decompress WASM → Node
  Given data compressed by WASM in browser
  When I decompress with native Node binding
  Then decompression succeeds
  And output matches original
```

### Scenario Group: Performance & Size

```gherkin
@priority:high @type:edge
Scenario: SC-16 Bundle size under 100KB
  Given the production WASM build
  When I measure liblzma.wasm + glue code gzipped
  Then total size is under 100KB

@priority:medium @type:edge
Scenario: SC-17 Large file streaming performance
  Given a 100MB file in browser
  When I compress via streaming API
  Then compression completes without memory spike
  And throughput is at least 5MB/s

@priority:medium @type:edge
Scenario: SC-18 Concurrent operations
  Given multiple compression tasks
  When I run 3 compressions in parallel
  Then all complete successfully
  And no WASM memory corruption occurs
```

**Coverage Matrix:**

| Scenario | Nominal | Edge | Error | Compatibility |
|----------|---------|------|-------|---------------|
| SC-01 | ✓ | | | |
| SC-02 | ✓ | | | |
| SC-03 | ✓ | | | |
| SC-04 | ✓ | | | |
| SC-05 | ✓ | | | |
| SC-06 | | ✓ | | |
| SC-07 | ✓ | | | |
| SC-08 | ✓ | | | |
| SC-09 | | ✓ | | |
| SC-09b | ✓ | | | |
| SC-10 | | | ✓ | |
| SC-10b | | | ✓ | |
| SC-11 | | | ✓ | |
| SC-12 | | | ✓ | |
| SC-13 | | | | ✓ |
| SC-14 | | | | ✓ |
| SC-15 | | | | ✓ |
| SC-16 | | ✓ | | |
| SC-17 | | ✓ | | |
| SC-18 | | ✓ | | |

**Totals:** 21 scenarios (10 nominal, 6 edge, 5 error, 3 compatibility)

## 6. Implementation Plan

### Block 0: Size Feasibility Spike — ✅ COMPLETED (2026-01-25)

**Type:** Spike / Proof of Concept
**Dependencies:** None
**Priority:** CRITICAL — Must pass before any other block
**Status:** ✅ **GO** — Validated

**Objective:** Validate that < 100KB gzipped bundle is achievable with Emscripten.

**Results:**

| Component | Raw (KB) | Gzipped (KB) |
|-----------|----------|--------------|
| WASM binary | 97.51 | 46.51 |
| JS glue code | 5.27 | 2.49 |
| **TOTAL** | **102.78** | **49.00** |

**Decision: ✅ GO** — Total gzipped (49 KB) is well under 100 KB target.

**Build Configuration Used:**
- Emscripten SDK 5.0.0
- CMake with `-DCMAKE_BUILD_TYPE=MinSizeRel -DBUILD_SHARED_LIBS=OFF`
- `emcc -Oz -flto -s FILESYSTEM=0 -s MODULARIZE=1 --closure 1`

**Deliverables:**
- [x] Size report (documented above)
- [x] Working build script: `wasm-spike/build-wasm.sh`
- [x] Decision: **GO**

---

### Block 1: Emscripten Build Infrastructure — 3-4 days

**Type:** Infrastructure
**Dependencies:** Block 0 (GO or CONDITIONAL)

**Files:**
- `src/wasm/build.sh` — Emscripten build script
- `src/wasm/pre.js` — Pre-JS for WASM init
- `src/wasm/Makefile` — Build automation
- `.github/workflows/build-wasm.yml` — CI for WASM builds

**Exit criteria:**
- [ ] `pnpm build:wasm` produces liblzma.wasm + liblzma.js
- [ ] WASM size < 100KB gzipped
- [ ] CI builds WASM on push

**Technical notes:**
- Use Emscripten flags: `-Os -s MODULARIZE=1 -s EXPORT_ES6=1`
- Disable threading: `--disable-threads` in configure
- Export only needed functions: `lzma_easy_encoder`, `lzma_stream_decoder`, etc.

---

### Block 2: Low-Level WASM Bindings — 4-5 days

**Type:** Feature slice
**Dependencies:** Block 1

**Files:**
- `src/wasm/bindings.ts` — TypeScript wrapper for Emscripten module
- `src/wasm/memory.ts` — Memory allocation helpers
- `src/wasm/types.ts` — WASM-specific types

**Exit criteria:**
- [ ] Can call `lzma_easy_encoder_init()` from TypeScript
- [ ] Memory allocated/freed correctly (no leaks)
- [ ] Error codes mapped to LZMAError classes

**Technical notes:**
- Use `ccall`/`cwrap` for function calls
- Implement malloc/free wrappers for buffer management
- Map return codes to existing error classes

---

### Block 3: Buffer API (xzAsync, unxzAsync) — 3-4 days

**Type:** Feature slice
**Dependencies:** Block 2

**Files:**
- `src/wasm/compress.ts` — Compression implementation
- `src/wasm/decompress.ts` — Decompression implementation
- `src/wasm/index.ts` — WASM module exports

**Exit criteria:**
- [ ] `xzAsync(buffer, options)` works in browser
- [ ] `unxzAsync(buffer, options)` works in browser
- [ ] Options: `preset`, `check`, `memlimit` supported
- [ ] Unit tests pass: SC-01, SC-02, SC-03

**Technical notes:**
- Copy buffer to WASM heap before processing
- Copy result back to JS ArrayBuffer after
- Free WASM memory in finally block

---

### Block 4: Streaming API (createXz, createUnxz) — 4-5 days

**Type:** Feature slice
**Dependencies:** Block 3

**Files:**
- `src/wasm/stream.ts` — Web Streams implementation
- `src/wasm/transform.ts` — TransformStream wrappers

**Exit criteria:**
- [ ] `createXz()` returns TransformStream
- [ ] `createUnxz()` returns TransformStream
- [ ] Chunked processing (no full buffer in memory)
- [ ] Unit tests pass: SC-04, SC-05, SC-06

**Technical notes:**
- Use LZMA_RUN for incremental encoding
- Flush with LZMA_FINISH on stream end
- Handle backpressure via TransformStream

---

### Block 5: Utility Functions — 1-2 days

**Type:** Feature slice
**Dependencies:** Block 2

**Files:**
- `src/wasm/utils.ts` — isXZ, versionString, parseFileIndex

**Exit criteria:**
- [ ] `isXZ(buffer)` works in browser
- [ ] `versionString()` returns liblzma version
- [ ] `parseFileIndex(buffer)` extracts XZ metadata

**Technical notes:**
- These are simpler functions, less WASM interaction
- Can mostly reuse existing TypeScript logic

---

### Block 6: Conditional Exports & Entry Points — 2-3 days

**Type:** Infrastructure
**Dependencies:** Block 3, Block 4, Block 5

**Files:**
- `src/lzma.browser.ts` — Browser entry point
- `src/lzma.node.ts` — Node entry point (re-export existing)
- `package.json` — Conditional exports
- `tsconfig.browser.json` — Browser-specific TS config

**Exit criteria:**
- [ ] `import from 'node-liblzma'` works in Vite
- [ ] `import from 'node-liblzma'` works in Node
- [ ] Bundler resolves correct entry point
- [ ] Tests pass: SC-07, SC-08, SC-09

**Technical notes:**
- Test with Vite, Webpack, esbuild
- Ensure WASM is properly bundled/loaded

---

### Block 7: Cross-Platform Testing — 3-4 days

**Type:** Testing
**Dependencies:** Block 6

**Files:**
- `test/wasm/compress.test.ts` — WASM compression tests
- `test/wasm/decompress.test.ts` — WASM decompression tests
- `test/wasm/stream.test.ts` — Streaming tests
- `test/wasm/compat.test.ts` — Node ↔ WASM compatibility
- `test/wasm/browser.test.ts` — Playwright browser tests

**Exit criteria:**
- [ ] All 18 BDD scenarios have passing tests
- [ ] Tests run in Node (WASM mode) and browser (Playwright)
- [ ] Byte-identical verification: SC-13, SC-14, SC-15

**Technical notes:**
- Use Playwright for real browser testing
- Generate test fixtures from native compression
- Test matrix: Chrome, Firefox, Safari

---

### Block 8: Documentation & Release — 2-3 days

**Type:** Documentation
**Dependencies:** Block 7

**Files:**
- `README.md` — Update with browser usage
- `docs/BROWSER.md` — Detailed browser guide
- `docs/API.md` — Update API docs
- `CHANGELOG.md` — v3.0.0 entry
- `llms.txt` — Update for new capabilities

**Exit criteria:**
- [ ] README shows browser usage example
- [ ] Browser compatibility matrix documented
- [ ] Bundle size documented
- [ ] Migration guide (if any breaking changes)
- [ ] TypeDoc regenerated

---

## 7. Test Strategy

### Test Pyramid

| Level | Count | Focus |
|-------|-------|-------|
| Unit | 30+ | WASM bindings, buffer operations |
| Integration | 15+ | Node ↔ WASM compatibility |
| E2E | 10+ | Real browser tests with Playwright |

### Test Data Requirements

**Fixtures:**
- `test/fixtures/sample.txt` — 1KB text
- `test/fixtures/sample.xz` — Compressed by native
- `test/fixtures/large.bin` — 10MB binary (generated)
- `test/fixtures/corrupt.xz` — Invalid XZ header

**Mocks:**
- WASM module mock for unit tests
- Fake ReadableStream for stream tests

### Test Environments

| Environment | Runner | Purpose |
|-------------|--------|---------|
| Node.js | Vitest | Unit + Integration |
| Chrome | Playwright | E2E browser |
| Firefox | Playwright | E2E browser |
| Safari | Playwright | E2E browser (CI) |

## 8. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Bundle > 100KB | H | M | Emscripten -Os, function stripping, test early |
| WASM memory leaks | H | M | Comprehensive tests, manual heap inspection |
| API drift Node/WASM | H | L | Shared TypeScript types, compatibility tests |
| Emscripten complexity | M | M | Start with PoC (Block 1), validate feasibility |
| Browser compat issues | M | L | Playwright matrix, polyfill detection |
| CI matrix explosion | M | H | Cache aggressively, parallelize, limit matrix |

## 9. Definition of Done

- [ ] All 8 blocks implemented
- [ ] All 18 BDD scenarios have passing tests
- [ ] All tests pass (unit + integration + e2e)
- [ ] Bundle size < 100KB gzipped verified
- [ ] Byte-identical output verified (Node vs WASM)
- [ ] Lint/typecheck pass
- [ ] Documentation updated (README, API docs, BROWSER.md)
- [ ] llms.txt updated
- [ ] /review clean (no blocking findings)
- [ ] Version 3.0.0 released to npm

---

## Appendix A: Emscripten Build Flags

```bash
emcc \
  -Os \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT='web,worker' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MAXIMUM_MEMORY=256MB \
  -s EXPORTED_FUNCTIONS='["_lzma_easy_encoder","_lzma_stream_decoder","_lzma_code","_lzma_end","_lzma_memusage","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8"]' \
  -I deps/xz/src/liblzma/api \
  deps/xz/src/liblzma/.libs/liblzma.a \
  -o src/wasm/liblzma.js
```

## Appendix B: Browser Support Matrix

| Browser | Min Version | WASM | Web Streams | Status |
|---------|-------------|------|-------------|--------|
| Chrome | 57+ | ✓ | 67+ | Full support |
| Firefox | 52+ | ✓ | 65+ | Full support |
| Safari | 11+ | ✓ | 14.1+ | Full support |
| Edge | 16+ | ✓ | 79+ | Full support |
| IE11 | - | ✗ | ✗ | Not supported |

## Appendix C: Size Budget

| Component | Estimated | Max |
|-----------|-----------|-----|
| liblzma.wasm | 60KB | 80KB |
| liblzma.js (glue) | 5KB | 10KB |
| bindings.ts compiled | 3KB | 5KB |
| **Total (gzipped)** | **~70KB** | **100KB** |
