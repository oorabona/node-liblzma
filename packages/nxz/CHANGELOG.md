# nxz-cli

## 6.0.0

### Major Changes

Internal rewiring to consume the new `tar-xz` v6 API. **No CLI behavior change** — flags, output, and exit codes are unchanged. The major bump is required because the `tar-xz` peer dependency moved to v6.0.0 (breaking redesign).

- Migrated to `tar-xz/file` helpers (`createFile`, `extractFile`, `listFile`) for path-based archive operations.
- Inline `TarEntry`/`TarXzModule` interfaces removed — types now imported directly from `tar-xz`.

### Patch Changes

- Updated dependencies (`tar-xz`: `^5.0.0` → `^6.0.0`)
