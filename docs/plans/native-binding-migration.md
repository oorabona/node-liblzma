---
doc-meta:
  status: draft
  scope: native-bindings
  type: research
  created: 2026-03-01
  updated: 2026-03-01
---

# Native Binding Migration: Research & Analysis

> **Status:** Conservatory — no migration planned. This document captures research
> performed in March 2026 for future reference if the need arises.

## Context

node-liblzma uses a C++ native addon (node-addon-api / N-API) compiled via node-gyp,
with a separate Emscripten pipeline for WASM. The question was whether migrating to
cmake-js or napi-rs would bring meaningful benefits.

### Current Architecture

```
liblzma.a (C, from deps/xz submodule)
  → node-liblzma.cpp (C++ N-API, ~1200 LOC)
    → Node.js (.node binary, loaded via node-gyp-build)

liblzma.a (C, same source)
  → Emscripten (emcc)
    → liblzma.wasm + liblzma.js (browser/worker)
```

### Current Build Toolchain

| Component | Tool | Notes |
|-----------|------|-------|
| Native build | node-gyp | binding.gyp (333 LOC, 3 conditional targets) |
| XZ source | git submodule (`deps/xz`) | Direct link to upstream, auto-monitored weekly |
| XZ compilation | CMake (via `build_xz_with_cmake.py`) | Already using CMake under the hood |
| Prebuild distribution | prebuildify + node-gyp-build | Prebuilds in `prebuilds/<platform>-<arch>/` |
| WASM build | Emscripten (emcc) | Separate pipeline (`pnpm build:wasm`) |
| CI matrix | Linux, macOS, Windows × x64 | Node 20 |

---

## Option 1: cmake-js (Replace node-gyp)

### What It Does

cmake-js replaces node-gyp as the native addon build driver. Instead of `binding.gyp`
(GYP format), you write `CMakeLists.txt` (CMake). The C++ source code stays identical.

### Benefits

- CMake is more expressive than GYP for complex builds
- Better cross-compilation support
- No Python 2/3 issues (node-gyp historically needed Python)
- Better IDE integration (CLion, VS Code CMake Tools)
- We already use CMake to build liblzma — could unify

### Hidden Costs Discovered

**1. prebuildify is INCOMPATIBLE with cmake-js**

prebuildify only works with node-gyp. Migrating to cmake-js requires switching the
entire binary distribution chain:

| Current | After cmake-js |
|---------|---------------|
| prebuildify (build) | prebuild (build) |
| node-gyp-build (runtime load) | prebuild-install (runtime load) |
| `postinstall: node-gyp-build` | `install: prebuild-install || cmake-js rebuild` |

This is not a drop-in replacement. It changes the CI workflow, the runtime loader
in `src/lzma.ts`, and the end-user install experience when prebuilds are missing.

**2. binding.gyp complexity is substantial**

Our binding.gyp has 333 lines with:
- 3 conditional targets (download xz, build xz with CMake, copy Windows DLLs)
- 4 Python helper scripts (walk_sources, download_xz, build_xz_cmake, copy_dll)
- Environment variable injection via `node -p` (USE_GLOBAL, RUNTIME_LINK, etc.)
- Platform-specific blocks: pkg-config (Unix), xcode_settings (macOS), msvs_settings (Windows)
- macOS rpath fixups, Windows DLL adjacency copying

Rewriting this as CMakeLists.txt would be ~150-200 lines of CMake plus custom targets.

**3. WASM pipeline unchanged**

cmake-js only handles `.node` native addons. WASM still requires Emscripten separately.
The dual pipeline problem (the main motivation for considering alternatives) is NOT solved.

**4. CMake-in-CMake irony**

We already run CMake to build liblzma from source (via `build_xz_with_cmake.py`).
Migrating to cmake-js means CMake orchestrating CMake — added complexity for the
same result.

### Verdict: NOT RECOMMENDED

No problem to solve. node-gyp works, prebuildify distributes binaries, CI is stable.
Migration cost (prebuild chain rewrite + CMakeLists.txt + CI rework + 3-platform testing)
is substantial with zero user-facing benefit.

---

## Option 2: napi-rs (Rewrite C++ → Rust)

### What It Does

napi-rs lets you write native Node.js addons in Rust instead of C++. Version 3 adds
WASM output from the same Rust source — potentially unifying native and WASM builds.

### Benefits

- Single source → native `.node` + `.wasm` output (eliminates dual pipeline)
- Automated CI for 14+ platform targets (linux-x64-gnu, darwin-arm64, win32-x64, etc.)
- Auto-generated TypeScript bindings
- Memory safety (Rust vs manual C++ memory management)
- Used by major projects: SWC, Rolldown, Lightning CSS, Biome

### Hidden Costs Discovered

**1. Rust lzma ecosystem is poorly maintained**

| Crate | Last Release | XZ Version | Status |
|-------|-------------|------------|--------|
| lzma-sys (alexcrichton) | Oct 2022 | xz 5.2 | Abandoned — 30 open issues, 10 pending PRs |
| xz2 (uses lzma-sys) | Jan 2023 | xz 5.2 | Stale — inherits lzma-sys problems |
| liblzma-sys (ChanTsune, fork) | Jan 2026 | xz 5.8 | Active fork, smaller community |
| lzma-rs (pure Rust) | Active | N/A | Encoder is "dumb" (hardcoded constants), not production-grade |

The de facto standard (`xz2` + `lzma-sys`) is stuck on xz 5.2 — **3+ years behind upstream**.

**2. xz2 adds a middle layer without value for us**

```
Current:   liblzma.a (C) → our C++ wrapper (N-API) → Node.js
With xz2:  liblzma.a (C) → xz2 (Rust FFI) → our Rust wrapper (napi-rs) → Node.js
```

xz2 is a thin FFI wrapper — the same function calls we already make in C++. It adds a
dependency we don't control (single maintainer, not responding to PRs) without adding value.

**3. Using lzma-sys/xz2 loses our upstream link**

We currently track upstream xz-utils via git submodule + weekly automated monitoring
(`check-xz-updates.yml`). This gives us same-week access to security fixes and new
versions.

With lzma-sys: we'd depend on a crate maintainer to bump the vendored xz version.
The current maintainer hasn't done this since 2022.

With liblzma-sys (fork): better (xz 5.8), but it's a community fork with lower adoption.

**4. Alternative: lzma-sys only (skip xz2)**

Could use `lzma-sys` (raw C bindings) directly and write our own Rust wrapper,
equivalent to our current C++ binding. This avoids the xz2 middle layer but still
depends on lzma-sys maintenance for the build system.

**5. Alternative: vendor liblzma ourselves in Rust**

Could write a Rust build script (`build.rs`) that compiles liblzma from our git
submodule, similar to what `build_xz_with_cmake.py` does today. This preserves our
direct upstream link but means maintaining a custom build.rs (~200-300 LOC).

**6. Rewrite cost**

The C++ binding (`node-liblzma.cpp`) is ~1200 LOC with:
- `Napi::ObjectWrap` (class wrapper for lzma_stream)
- `Napi::AsyncWorker` (async compression/decompression)
- Template methods for sync/async branching
- Memory tracking (`AdjustExternalMemory`)
- 70+ exported constants (return codes, filters, check types, etc.)

Rewriting this in Rust with napi-rs is feasible but non-trivial — estimated 2-4 weeks
for an experienced Rust developer, plus stabilization time.

### Verdict: NOT RECOMMENDED (today)

The Rust lzma ecosystem is not mature enough. The main benefit (unified native+WASM)
is real but the cost is high: rewrite 1200 LOC C++, lose direct upstream tracking
(or maintain custom build.rs), depend on under-maintained crates.

**Revisit if:** lzma-sys gets a new maintainer, or napi-rs v3 WASM output proves
itself in other FFI-heavy projects (not just pure-Rust addons).

---

## Ecosystem Survey (March 2026)

### npm Packages for XZ/LZMA

| Package | Weekly Downloads | Binding Type | WASM | Maintained | Notes |
|---------|-----------------|-------------|------|------------|-------|
| lzma-native | ~68K | C++ (node-gyp) | No | Inactive (12+ months) | Was dominant, now abandoned |
| node-liblzma (us) | ~1K | C++ (node-gyp) | Yes (Emscripten) | Active | Only dual native+WASM solution |
| lzma | ~15K | Pure JS (emscripten port) | Sort of | Stale | Slow, no streaming |
| xz | ~2K | C++ (node-gyp) | No | Stale | Minimal wrapper |

### Rust Crates for XZ/LZMA

| Crate | Monthly Downloads | Type | Notes |
|-------|-------------------|------|-------|
| xz2 | 2.5M | FFI → C liblzma | Stale (Jan 2023), bundles xz 5.2 |
| lzma-sys | 2.26M | Raw C bindings | Abandoned (Oct 2022), 30 open issues |
| liblzma-sys | Lower | Fork of lzma-sys | Active (Jan 2026), bundles xz 5.8 |
| lzma-rs | ~500K | Pure Rust | Encoder not production-grade |
| liblzma | Lower | High-level wrapper | Uses liblzma-sys, actively maintained |

**Key finding:** No npm package has migrated to napi-rs for lzma compression.
No production pure-Rust WASM LZMA encoder exists.

---

## Recommendation

**Stay on current stack.** The combination of:
- node-gyp + prebuildify (battle-tested native distribution)
- git submodule + check-xz-updates.yml (direct upstream tracking)
- Emscripten (proven WASM output, 52KB gzipped)

...is strictly superior to both alternatives in our specific case.

### When to Revisit

| Trigger | Consider |
|---------|----------|
| node-gyp drops N-API support | cmake-js |
| prebuildify becomes unmaintained | cmake-js + prebuild |
| napi-rs v3 WASM matures in FFI projects | napi-rs |
| lzma-sys gets active maintainer (xz 5.8+) | napi-rs |
| ARM64 prebuilds needed (macOS Apple Silicon, Linux ARM) | napi-rs (better cross-compile story) |
| Our C++ binding needs major changes | napi-rs (rewrite opportunity) |

---

## References

- [cmake-js GitHub](https://github.com/cmake-js/cmake-js) — v7.4.0, actively maintained
- [napi-rs](https://napi.rs/) — v3, single source → native + WASM
- [xz2-rs GitHub](https://github.com/alexcrichton/xz2-rs) — last commit Jan 2023
- [lzma-sys on lib.rs](https://lib.rs/crates/lzma-sys) — v0.1.20, Oct 2022
- [liblzma-sys on lib.rs](https://lib.rs/crates/liblzma-sys) — v0.4.5, Jan 2026
- [lzma-rs](https://github.com/gendx/lzma-rs) — pure Rust, encoder limitations
- [Node-API with cmake-js](https://github.com/nodejs/node-addon-api/blob/main/doc/cmake-js.md)
- [prebuild vs prebuildify](https://github.com/prebuild/prebuildify/issues/49)
