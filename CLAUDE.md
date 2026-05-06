# Project: node-liblzma

pnpm monorepo — Node.js bindings for liblzma (XZ/LZMA2), with companion tar.xz library and CLI.
Three packages: `node-liblzma` (root), `tar-xz`, `@oorabona/nxz`.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## Project Structure

```
node-liblzma/
├── docs/                    # Documentation (RELEASING.md, BROWSER.md, nxz-usage.md, ...)
├── lib/                     # Compiled JavaScript output
├── packages/
│   ├── tar-xz/              # tar.xz library (npm: tar-xz, v6.1.0)
│   └── nxz/                 # CLI wrapper (npm: @oorabona/nxz, v7.0.0, binary: nxz)
├── src/
│   ├── bindings/            # Native C++ addon source (node-liblzma.cpp / .hpp)
│   ├── wasm/                # Emscripten WASM bindings + build helpers
│   └── *.ts                 # TypeScript source files
└── scripts/                 # Build scripts (Python + JS)
```

Actionable backlog: [GitHub Issues](https://github.com/oorabona/node-liblzma/issues).

## Stack

- **Language:** TypeScript strict / C++ (native) / C (WASM via Emscripten). Root `tsconfig.json` has `noUncheckedIndexedAccess: false`; workspace packages `tar-xz` and `@oorabona/nxz` enable it.
- **Package Manager:** pnpm 10+ workspace
- **Test Framework:** Vitest 4.x
- **Linter:** Biome 2.x
- **Build:** node-gyp + tsc + prebuildify (native); emcc (WASM)
- **Native binding:** node-addon-api (N-API)
- **Node.js:** root `node-liblzma` >= 22.0.0; workspace packages `tar-xz` and `@oorabona/nxz` >= 20.0.0

## Conventions

### Code Style
- ESM modules (`"type": "module"`)
- Biome for linting and formatting
- TypeScript strict mode (per-package `noUncheckedIndexedAccess`: see Stack section above)

### Git
- Branch naming: `<type>/<description>`
- Commit format: Conventional commits
- Pre-commit hook: nano-staged with Biome

### Testing
- Unit tests with Vitest 4.x
- Coverage: monocart (default) or v8 (`pnpm test:coverage-v8` — lcov output, used by Codecov)
- 100% lines + branches as a project target (currently met; not enforced via vitest threshold — maintained by convention via the `v8 ignore start/stop` discipline for unreachable / negative-ROI branches)

## Commands Reference

| Action | Command |
|--------|---------|
| Install | `pnpm install` |
| Build TS | `pnpm build` |
| Build Native | `pnpm prebuildify` |
| Build WASM | `pnpm build:wasm` (requires `emcc` in PATH) |
| Test | `pnpm test` |
| Test (watch) | `pnpm test:watch` |
| Test (coverage, monocart) | `pnpm test:coverage` |
| Test (coverage, v8/lcov) | `pnpm test:coverage-v8` |
| Lint | `pnpm lint` |
| Format | `pnpm format:write` |
| Check all | `pnpm check` |
| Typecheck | `pnpm type-check` |
| Generate docs | `pnpm typedoc` |
| Release | `pnpm release` |

## Important Notes

- Native addon requires liblzma system library or builds from source (XZ tarball downloaded into `deps/` at build time by `binding.gyp` → `scripts/download_xz_from_github.py`; `deps/` is gitignored, NOT a git submodule)
- Uses prebuildify for prebuilt binaries; `prebuilds/` must be in `files` array
- Dual implementation: native N-API + Emscripten WASM (browser condition in package.json exports)
- License: LGPL-3.0

## Workflow Integration

This project uses the standard Claude Code workflow:
1. `/clarify` - Scope clarification
2. `/spec` - Specification production
3. `/implement` - Implementation
4. `/review` - Code review
5. `/finalize` - Story completion

Run `/workflow <task>` to execute the full cycle.
