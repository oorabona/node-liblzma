# tar-xz

## 6.0.1

### Patch Changes

- [`adfbc99`](https://github.com/oorabona/node-liblzma/commit/adfbc99fe227e1a09a7297b03f6982106f660dce) Thanks [@oorabona](https://github.com/oorabona)! - Validate Changesets workflow on this monorepo. Test changeset to confirm the "Version Packages" PR opens correctly. No functional change.

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
