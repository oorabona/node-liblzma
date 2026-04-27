# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.0.0] - 2026-04-27

### BREAKING CHANGES

Complete API redesign. Universal stream-first design — same signatures
in Node and Browser, built around `AsyncIterable<Uint8Array>`.

### Added
- **Universal API** — `create()`, `extract()`, `list()` with identical
  signatures across Node and Browser.
- **`tar-xz/file` subpath export** (Node only) — opt-in path-based
  helpers `createFile()`, `extractFile()`, `listFile()` for filesystem
  I/O. Keeps the core SRP-clean (no fs deps in the core).
- **`AsyncIterable<TarEntryWithData>`** from `extract()` — entries are
  yielded lazily; each carries a streaming `data` AsyncIterable plus
  `bytes()` and `text()` collector helpers.
- **`TarInput` union type** — accepts `AsyncIterable<Uint8Array>`,
  `Iterable<Uint8Array>`, `Uint8Array`, `ArrayBuffer`,
  `ReadableStream<Uint8Array>` (Web), or `NodeJS.ReadableStream`.
  Normalized internally to a single shape.

### Security
Comprehensive symlink/path TOCTOU hardening (18 vectors audited and
closed in a single consolidated commit, after 7 rounds of Copilot review):
- Leaf symlink check (`target` itself, not just ancestors).
- Ancestor symlink walk extended to FILE/DIRECTORY/SYMLINK/HARDLINK.
- ENOENT correctly continues the ancestor walk instead of stopping.
- Hardlink `linkSource` validated for symlink-leaf and symlink-ancestor.
- `strip` option applied to both `name` and `linkname`.
- Empty / NUL-bearing names and linknames rejected.
- Dot-segment placeholder names (`.`, `./`, `..`) rejected.
- Setuid/setgid/sticky bits stripped from extracted modes by default
  (mirrors GNU tar `--no-same-permissions`).
- File extraction uses `fs.open(O_NOFOLLOW)` + fd-based `chmod`/`utimes`
  on POSIX — eliminates by-path TOCTOU window for permissions/timestamps.
- `pipeline()` instead of `pipe()` so source errors propagate properly.
- Threat-model documentation: concurrent attacker process is explicitly
  out of scope (POSIX `openat2(RESOLVE_BENEATH)` not exposed by Node).

### Removed
- `extractToMemory()` — replaced by `extract()` + `entry.bytes()`.
- `createTarXz()` / `extractTarXz()` / `listTarXz()` (browser-prefixed
  names) — replaced by unified `create()` / `extract()` / `list()`.
- `BrowserCreateOptions` / `BrowserExtractOptions` — unified into
  single `CreateOptions` / `ExtractOptions`.
- `ExtractedFile` — replaced by `TarEntryWithData`.

### Changed
- Source files for `create()` use the new `TarSourceFile` shape:
  `{ name, source, mode?, mtime?, linkname? }`. `source` accepts
  `AsyncIterable<Uint8Array> | Uint8Array | ArrayBuffer | string`
  (string is a Node-only fs path).
- `TarPack` / `TarUnpack` Transform classes are now internal; not
  exported from the package root. Use the high-level API.
- Default compression preset is uniform: `6` (Node and Browser).

### Migration v5 → v6
See [README.md § Migration v5 → v6](./README.md#migration-v5--v6) for
full code examples.

## [5.0.1] - 2026-04-27

### Fixed
- pin pnpm/action-setup to v5 in refresh-lockfile (v6 corrupts lockfile) (ci) ([f39d603](https://github.com/oorabona/node-liblzma/commit/f39d603))
- regenerate pnpm-lock.yaml (was broken with duplicate YAML document) (deps) ([e0c66ab](https://github.com/oorabona/node-liblzma/commit/e0c66ab))
- use squash merge in Dependabot auto-merge (linear history required) (ci) ([f3aee60](https://github.com/oorabona/node-liblzma/commit/f3aee60))
- point tar-xz demo Vite alias to browser entry ([8aea7ac](https://github.com/oorabona/node-liblzma/commit/8aea7ac))
- point demo Vite alias to browser entry (fixes docs build) ([e86dba5](https://github.com/oorabona/node-liblzma/commit/e86dba5))

### Changed
- sync workspace package versions to npm registry (3.2.0 -> 5.0.0) ([900a055](https://github.com/oorabona/node-liblzma/commit/900a055))
- refresh lockfile for latest transitive dependencies (deps) ([8345c25](https://github.com/oorabona/node-liblzma/commit/8345c25))
- propagate anti-flake cleanup pattern to 3 high-risk integration tests ([f752664](https://github.com/oorabona/node-liblzma/commit/f752664))
- add afterEach cleanup + timer tracking in error_recovery test (anti-flake) ([2d7f285](https://github.com/oorabona/node-liblzma/commit/2d7f285))
- refresh lockfile for latest transitive dependencies (deps) ([bc7e804](https://github.com/oorabona/node-liblzma/commit/bc7e804))
- refresh lockfile for latest transitive dependencies (deps) ([dedd2c1](https://github.com/oorabona/node-liblzma/commit/dedd2c1))
- bump @vitest/ui (#106) (deps-dev) ([276f0b4](https://github.com/oorabona/node-liblzma/commit/276f0b4))
- refresh lockfile for latest transitive dependencies (deps) ([8b7b5b9](https://github.com/oorabona/node-liblzma/commit/8b7b5b9))
- ignore pnpm/action-setup v6+ in Dependabot (corrupts lockfile) (ci) ([fd2cf8c](https://github.com/oorabona/node-liblzma/commit/fd2cf8c))
- refresh lockfile for latest transitive dependencies (deps) ([a01694e](https://github.com/oorabona/node-liblzma/commit/a01694e))
- refresh lockfile for latest transitive dependencies (deps) ([e2eca27](https://github.com/oorabona/node-liblzma/commit/e2eca27))
- refresh lockfile for latest transitive dependencies (deps) ([b1386e9](https://github.com/oorabona/node-liblzma/commit/b1386e9))
- refresh lockfile for latest transitive dependencies (deps) ([1ba850e](https://github.com/oorabona/node-liblzma/commit/1ba850e))
- refresh lockfile for latest transitive dependencies (deps) ([e66f8fb](https://github.com/oorabona/node-liblzma/commit/e66f8fb))
- refresh lockfile for latest transitive dependencies (deps) ([fd906d6](https://github.com/oorabona/node-liblzma/commit/fd906d6))
- refresh lockfile for latest transitive dependencies (deps) ([e085fa4](https://github.com/oorabona/node-liblzma/commit/e085fa4))
- bump @vitest/ui in the dev-dependencies group (#95) (deps-dev) ([01e828c](https://github.com/oorabona/node-liblzma/commit/01e828c))
- refresh lockfile for latest transitive dependencies (deps) ([cfe60ca](https://github.com/oorabona/node-liblzma/commit/cfe60ca))
- refresh lockfile for latest transitive dependencies (deps) ([1d0dd42](https://github.com/oorabona/node-liblzma/commit/1d0dd42))
- refresh lockfile for latest transitive dependencies (deps) ([775ed0f](https://github.com/oorabona/node-liblzma/commit/775ed0f))
- refresh lockfile for latest transitive dependencies (deps) ([9a66903](https://github.com/oorabona/node-liblzma/commit/9a66903))
- refresh lockfile for latest transitive dependencies (deps) ([3e2bd44](https://github.com/oorabona/node-liblzma/commit/3e2bd44))
- refresh lockfile for latest transitive dependencies (deps) ([d3bea99](https://github.com/oorabona/node-liblzma/commit/d3bea99))


[Unreleased]: https://github.com/oorabona/node-liblzma/compare/v5.0.1...HEAD
[v5.0.1]: https://github.com/oorabona/node-liblzma/releases/tag/v5.0.1
[5.0.1]: https://github.com/oorabona/node-liblzma/releases/tag/v5.0.1