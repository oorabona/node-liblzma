# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.0.0] - 2026-04-27

### BREAKING CHANGES

Internal rewiring to consume the new `tar-xz` v6 API. **No CLI behavior
change** — flags, output, and exit codes are unchanged. The major bump
is required because the `tar-xz` peer dependency moved to v6.0.0
(breaking redesign).

### Changed
- Migrated to `tar-xz/file` helpers (`createFile`, `extractFile`,
  `listFile`) for path-based archive operations.
- Inline `TarEntry`/`TarXzModule` interfaces removed — types now
  imported directly from `tar-xz`.

### Dependencies
- `tar-xz`: `^5.0.0` → `^6.0.0`

