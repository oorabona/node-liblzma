# nxz

## [Unreleased]

## [7.0.0] - 2026-04-30

### BREAKING CHANGES
- Package renamed from `nxz-cli` to `nxz`. Update install commands: `npm i -g nxz` (was `npm i -g nxz-cli`). Binary name unchanged (`nxz`). The old `nxz-cli` package on npm is deprecated with a redirect message; consumers using `npx nxz-cli` should switch to `npx nxz`.

### Fixed
- CLI `--help` example for `nxz -T -z dir/` now correctly shows `dir.tar.xz` as default output (was previously labeled `archive.tar.xz`).

## [6.1.0] - 2026-04-30

### Added
- `--memlimit-decompress <SIZE>` CLI flag for capping decompression memory (#117) ([2e3c25f](https://github.com/oorabona/node-liblzma/commit/2e3c25f)). Accepts plain integer bytes, IEC binary suffixes (`KiB`, `MiB`, `GiB`, `TiB`), and SI decimal suffixes (`KB`, `MB`, `GB`, `TB`). Special values `0` and `max` (case-insensitive) explicitly mean "no limit". Throws `LZMAMemoryLimitError` and exits 1 when the limit is exceeded. Mirrors `xz` CLI semantics.

### Notes
Transitive benefits via `tar-xz@6.1.0` (peer dep, automatic for users on `^6.0.0`) :
- **True streaming** for `extract()` and `list()` — memory is now `O(largest single entry)` instead of `O(archive)` when extracting / listing large `.tar.xz` archives.
- **Win32 symlink-swap TOCTOU hardening** for `extract()` (JS-pure `'wx'`+retry fail-closed pattern).
- **Native `memlimit` parity** with WASM (now exposed via the new `--memlimit-decompress` flag above).
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