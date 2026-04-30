# nxz-cli

## [Unreleased]

## [6.1.0] - 2026-04-30

### ⚠️ BREAKING CHANGES
- redesign for v6 — universal stream-first API (#108) (tar-xz) ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))

### Added
- add --memlimit-decompress flag to CLI (#117) (nxz) ([2e3c25f](https://github.com/oorabona/node-liblzma/commit/2e3c25f))
- adopt Changesets for monorepo versioning + changelog generation (ci) ([adfbc99](https://github.com/oorabona/node-liblzma/commit/adfbc99))
- redesign for v6 — universal stream-first API (#108) (tar-xz) ⚠️ BREAKING ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))

### Fixed
- revert to `filter && !filter(...)` semantics, but extract ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- explicit `firstFile === undefined` check + descriptive throw, ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- `typeof filter === 'function' && !filter(entry)` — null-safe, ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- toAsyncIterable mis-dispatched Uint8Array via Symbol.iterator ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))

### Changed
- biome warnings sweep + cognitive-complexity extract-method (63→1) (#115) ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- 7 changed, +24/-29. ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- 10 changed, +53/-28. ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - pnpm test: 671 pass / 0 fail / 3 skip (identical to baseline) ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- 3 changed, +192/-175. ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - pnpm test: 671 pass / 0 fail / 3 skip (identical to baseline) ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- 3 changed, +74/-25. ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - pnpm test: 671 pass / 0 fail / 3 skip (identical to baseline) ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - `ensureSafeLinkname(linkname, opts, name)` — leaf+ancestor symlink ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- 2 changed, +417/-250 net (mostly helper extraction). ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - pnpm --filter tar-xz test: 155 pass / 0 fail / 3 skip ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - pnpm --filter tar-xz test: 155 pass / 0 fail / 3 skip ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - pnpm --filter nxz-cli test: 27/27 pass ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - pnpm --filter tar-xz test: 155/0/3 ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - pnpm test: full suite green (155 tar-xz / 27 nxz / 489 root = 671/0/3) ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - pnpm test: 671/0/3 (full suite) ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- - release-it (existing release.yml + .release-it.json) is retained for ([adfbc99](https://github.com/oorabona/node-liblzma/commit/adfbc99))
- capture tar-xz v6 redesign in CHANGELOGs + TODO.md ([9abd0a2](https://github.com/oorabona/node-liblzma/commit/9abd0a2))
- test fails on revert, passes on fix. ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))
- sync workspace package versions to npm registry (3.2.0 -> 5.0.0) ([900a055](https://github.com/oorabona/node-liblzma/commit/900a055))

### Removed
- - extractToMemory() — replaced by extract() + entry.bytes() ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))

## 6.0.0

### Major Changes

Internal rewiring to consume the new `tar-xz` v6 API. **No CLI behavior change** — flags, output, and exit codes are unchanged. The major bump is required because the `tar-xz` peer dependency moved to v6.0.0 (breaking redesign).

- Migrated to `tar-xz/file` helpers (`createFile`, `extractFile`, `listFile`) for path-based archive operations.
- Inline `TarEntry`/`TarXzModule` interfaces removed — types now imported directly from `tar-xz`.

### Patch Changes

- Updated dependencies (`tar-xz`: `^5.0.0` → `^6.0.0`)

[Unreleased]: https://github.com/oorabona/node-liblzma/compare/v6.1.0...HEAD
[v6.1.0]: https://github.com/oorabona/node-liblzma/releases/tag/v6.1.0
[6.1.0]: https://github.com/oorabona/node-liblzma/releases/tag/v6.1.0