# tar-xz

## [Unreleased]

## [6.1.1] - 2026-05-06

### Changed
- enrich package metadata (description + keywords) for 3 packages (#141) ([5f0bb5b](https://github.com/oorabona/node-liblzma/commit/5f0bb5b))
- document TarEntryTypeValue with JSDoc + expose in index (#137) (tar-xz) ([fe56124](https://github.com/oorabona/node-liblzma/commit/fe56124))
- add tar-xz API and nxz CLI to GitHub Pages (#133) (pages) ([2c22298](https://github.com/oorabona/node-liblzma/commit/2c22298))
- close 7 final coverage partials to reach 100% (#131) (tar-xz) ([0830fac](https://github.com/oorabona/node-liblzma/commit/0830fac))
- close 7 coverage partials with surgical v8 ignores (#130) (tar-xz) ([de86c0c](https://github.com/oorabona/node-liblzma/commit/de86c0c))
- close extract.ts coverage partials with v8 ignores (#129) (tar-xz) ([3abb041](https://github.com/oorabona/node-liblzma/commit/3abb041))
- close file.ts coverage partials with tests + v8 ignores (#128) (tar-xz) ([8e51020](https://github.com/oorabona/node-liblzma/commit/8e51020))
- cover three trivial file.ts branches (mtime=0, FILE type, mode=0) (#126) (tar-xz) ([5c496f8](https://github.com/oorabona/node-liblzma/commit/5c496f8))
- close remaining coverage gaps to 100% lines (#125) (tar-xz) ([7189f8e](https://github.com/oorabona/node-liblzma/commit/7189f8e))
- cover toAsyncIterable across Node and Browser variants (#124) (tar-xz) ([8c0f994](https://github.com/oorabona/node-liblzma/commit/8c0f994))
- wrap defensive-unreachable branches with v8 ignore start/stop (#123) (tar-xz) ([add1724](https://github.com/oorabona/node-liblzma/commit/add1724))
- remove dead biome suppression in tar-xz node-api spec (#119) (lint) ([49c7f14](https://github.com/oorabona/node-liblzma/commit/49c7f14))
- biome warnings sweep + cognitive-complexity extract-method (63→1) (#115) ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))

### Fixed
- use absolute URLs in typedoc navigationLinks (#136) (docs) ([cd1185c](https://github.com/oorabona/node-liblzma/commit/cd1185c))
- include CHANGELOG.md and SECURITY.md in published tarball (tar-xz) ([408e955](https://github.com/oorabona/node-liblzma/commit/408e955))

## [6.1.0] - 2026-04-29

### ⚠️ BREAKING CHANGES
- redesign for v6 — universal stream-first API (#108) (tar-xz) ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))

### Added
- true streaming for Node extract()/list() — O(largest entry) (#113) (tar-xz) ([06a9937](https://github.com/oorabona/node-liblzma/commit/06a9937))
- wire memlimit through N-API decoder (#112) (native) ([0d09200](https://github.com/oorabona/node-liblzma/commit/0d09200))
- wire memlimit option through unxzAsync/unxz (#111) (wasm) ([6e2bc09](https://github.com/oorabona/node-liblzma/commit/6e2bc09))
- adopt Changesets for monorepo versioning + changelog generation (ci) ([adfbc99](https://github.com/oorabona/node-liblzma/commit/adfbc99))
- redesign for v6 — universal stream-first API (#108) (tar-xz) ⚠️ BREAKING ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))

### Fixed
- close Win32 symlink-swap TOCTOU with JS-pure 'wx'+retry fail-closed (#114) (tar-xz) ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- re-add @changesets/cli (was clobbered by pnpm add of changelog-github) (deps) ([6d76280](https://github.com/oorabona/node-liblzma/commit/6d76280))
- use 'changeset' so the bin resolves with --ignore-scripts (ci) ([78b91f7](https://github.com/oorabona/node-liblzma/commit/78b91f7))
- toAsyncIterable mis-dispatched Uint8Array via Symbol.iterator ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))
- use always() in publish job to bypass skipped build (workspace target) (ci) ([2e08977](https://github.com/oorabona/node-liblzma/commit/2e08977))
- pin pnpm/action-setup to v5 in refresh-lockfile (v6 corrupts lockfile) (ci) ([f39d603](https://github.com/oorabona/node-liblzma/commit/f39d603))
- regenerate pnpm-lock.yaml (was broken with duplicate YAML document) (deps) ([e0c66ab](https://github.com/oorabona/node-liblzma/commit/e0c66ab))
- use squash merge in Dependabot auto-merge (linear history required) (ci) ([f3aee60](https://github.com/oorabona/node-liblzma/commit/f3aee60))
- point tar-xz demo Vite alias to browser entry ([8aea7ac](https://github.com/oorabona/node-liblzma/commit/8aea7ac))
- point demo Vite alias to browser entry (fixes docs build) ([e86dba5](https://github.com/oorabona/node-liblzma/commit/e86dba5))

### Changed
- finalize WIN32-TOCTOU-2026-04-29 — promote spec, mark TODO done ([1ee9db4](https://github.com/oorabona/node-liblzma/commit/1ee9db4))
- node-tar is pure JS and explicitly does NOT protect Windows ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 0 errors. Type-check: 0 errors. ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 155 pass / 0 fail / 3 pre-existing skips. ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 0 errors. Type-check: 0 errors. ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 155 pass / 0 fail / 3 pre-existing skips (identical to pre-fix). ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 0 errors. Type-check: 0 errors. ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- round 1 = 6 findings (3 M + 2 L + 1 misclassified), round 2 ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 155 pass / 0 fail / 3 pre-existing skips. ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 0 errors. Type-check: 0 errors. ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- round 1 = 6 findings, round 2 = 3, round 3 = 1, round 4 ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 155 pass / 0 fail / 3 pre-existing skips. ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 0 errors. Type-check: 0 errors. ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- round 1=6, round 2=3, round 3=1, round 4=3 (2 real Ms in ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 155 pass / 0 fail / 3 pre-existing skips. ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- 0 errors. Type-check: 0 errors. ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- round 1=6, round 2=3, round 3=1, round 4=3 (2 real Ms ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- refresh lockfile for latest transitive dependencies (deps) ([06e9590](https://github.com/oorabona/node-liblzma/commit/06e9590))
- finally swallows cleanup errors on consumer-break, ([06a9937](https://github.com/oorabona/node-liblzma/commit/06a9937))
- 150+3-skip pass; memory 3+1-skip pass. tsc + lint + build green. ([06a9937](https://github.com/oorabona/node-liblzma/commit/06a9937))
- refresh lockfile for latest transitive dependencies (deps) ([f8f21d0](https://github.com/oorabona/node-liblzma/commit/f8f21d0))
- - release-it (existing release.yml + .release-it.json) is retained for ([adfbc99](https://github.com/oorabona/node-liblzma/commit/adfbc99))
- capture tar-xz v6 redesign in CHANGELOGs + TODO.md ([9abd0a2](https://github.com/oorabona/node-liblzma/commit/9abd0a2))
- test fails on revert, passes on fix. ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))
- release v5.0.1 (tar-xz) ([0c631f5](https://github.com/oorabona/node-liblzma/commit/0c631f5))
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

### Removed
- - extractToMemory() — replaced by extract() + entry.bytes() ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))

## 6.0.0

### Major Changes

Complete API redesign. Universal stream-first design — same signatures in Node and Browser, built around `AsyncIterable<Uint8Array>`.

#### New API

- **Universal `create()`, `extract()`, `list()`** — identical signatures across Node and Browser.
- **`tar-xz/file` subpath export** (Node only) — opt-in path-based helpers `createFile()`, `extractFile()`, `listFile()`. Keeps the core SRP-clean (no fs deps in the core).
- **`AsyncIterable<TarEntryWithData>`** from `extract()` — entries yielded lazily; each carries a streaming `data` AsyncIterable plus `bytes()` and `text()` collector helpers.
- **`TarInput` union type** — accepts `AsyncIterable<Uint8Array>`, `Iterable<Uint8Array>`, `Uint8Array`, `ArrayBuffer`, `ReadableStream<Uint8Array>` (Web), or `NodeJS.ReadableStream`.

#### Security hardening

Comprehensive symlink/path TOCTOU hardening (18 vectors audited and closed in a single consolidated commit, after 7 rounds of Copilot review):

- Leaf symlink check (`target` itself, not just ancestors).
- Ancestor symlink walk extended to FILE/DIRECTORY/SYMLINK/HARDLINK.
- ENOENT correctly continues the ancestor walk instead of stopping.
- Hardlink `linkSource` validated for symlink-leaf and symlink-ancestor.
- `strip` option applied to both `name` and `linkname`.
- Empty / NUL-bearing names and linknames rejected.
- Dot-segment placeholder names (`.`, `./`, `..`) rejected.
- Setuid/setgid/sticky bits stripped from extracted modes by default (mirrors GNU tar `--no-same-permissions`).
- File extraction uses `fs.open(O_NOFOLLOW)` + fd-based `chmod`/`utimes` on POSIX — eliminates by-path TOCTOU window for permissions/timestamps.
- `pipeline()` instead of `pipe()` so source errors propagate properly.
- Threat-model documentation: concurrent attacker process is explicitly out of scope (POSIX `openat2(RESOLVE_BENEATH)` not exposed by Node).

#### Removed

- `extractToMemory()` — replaced by `extract()` + `entry.bytes()`.
- `createTarXz()` / `extractTarXz()` / `listTarXz()` (browser-prefixed names) — replaced by unified `create()` / `extract()` / `list()`.
- `BrowserCreateOptions` / `BrowserExtractOptions` — unified into single `CreateOptions` / `ExtractOptions`.
- `ExtractedFile` — replaced by `TarEntryWithData`.

#### Changed

- Source files for `create()` use the new `TarSourceFile` shape: `{ name, source, mode?, mtime?, linkname? }`. `source` accepts `AsyncIterable<Uint8Array> | Uint8Array | ArrayBuffer | string` (string is a Node-only fs path).
- `TarPack` / `TarUnpack` Transform classes are now internal; not exported from the package root.
- Default compression preset is uniform: `6` (Node and Browser).

#### Migration v5 → v6

See [README.md § Migration v5 → v6](./README.md#migration-v5--v6) for full code examples.

## 5.0.1

### Patch Changes

- Workspace package versions synchronized to npm registry (3.2.0 → 5.0.0). Internal infrastructure updates (CI workflows, lockfile maintenance, anti-flake test cleanup). No API changes.

[Unreleased]: https://github.com/oorabona/node-liblzma/compare/v6.1.1...HEAD
[v6.1.0]: https://github.com/oorabona/node-liblzma/releases/tag/v6.1.0
[6.1.0]: https://github.com/oorabona/node-liblzma/releases/tag/v6.1.0
[v6.1.1]: https://github.com/oorabona/node-liblzma/releases/tag/v6.1.1
[6.1.1]: https://github.com/oorabona/node-liblzma/releases/tag/v6.1.1