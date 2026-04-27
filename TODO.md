# Project Backlog

## In Progress

_None_

## Pending - HIGH

_None_

## Pending - MEDIUM

_None_

## Pending - LOW (Nice to Have)

_None_

## Completed

- [x] ✅ [tar-xz v6] Universal stream-first redesign: `create()`/`extract()`/`list()` with `AsyncIterable<Uint8Array>`, identical Node/Browser signatures, `tar-xz/file` subpath for fs helpers — published as `tar-xz@6.0.0` + `nxz-cli@6.0.0` (2026-04-27)
- [x] ✅ [tar-xz v6] Security hardening: 18 path/symlink TOCTOU vectors audited and closed (leaf check, ENOENT walk, hardlink linkSource, NUL/empty rejection, setuid mask, fd-based fs ops with O_NOFOLLOW, pipeline error propagation) — 8 Copilot review rounds + 1 consolidated audit (2026-04-27)
- [x] ✅ [Infra] Independent versioning per workspace package: `release.yml`/`publish.yml` accept `target_package` input, no cross-package version sync; proven in prod — `tar-xz@6.0.0` published without bumping `node-liblzma` (still at 5.0.0) (2026-04-27)
- [x] ✅ [Infra] Custom CodeQL workflow with `paths-ignore` for dep-only PRs — Dependabot fire-and-forget unblocked (CodeQL no longer NEUTRAL-blocks dep bumps) (2026-04-24)
- [x] ✅ [Test] Anti-flake pattern (track + afterEach destroy + timer cleanup) propagated to 4 high-risk integration tests (error_recovery, callbacks, parameter_parsing, constructor_and_sync_processing) (2026-04-26)
- [x] ✅ [CI] `pnpm/action-setup@v6.0.1+` validated for refresh-lockfile (upstream fix for 2-document YAML corruption); `dependabot-auto-merge.yml` with `--squash` (linear history) (2026-04-19)
- [x] ✅ [Release] node-liblzma v5.0.0 — Node 22 minimum, TypeScript 6, XZ 5.8.3 (2026-04-09)
- [x] ✅ [API] Remove deprecated `messages` array — definition, default export, index.d.ts, and 4 test refs removed (2026-03-06)
- [x] ✅ [Refactor] processBuffer CC reduction: 54→8 (extract), 34→6 (list) via shared tar-parser.ts (2026-03-06)
- [x] ✅ [CLI] nxz.ts CC reduction: 6 helpers extracted (createTarFile -49%, main -24%) (2026-03-06)
- [x] ✅ [Pool] Remove dead guard in processQueue (unreachable if (!item) behind v8 ignore) (2026-03-06)
- [x] ✅ [Coverage] Add 8 tests for partial branches (createPaxRecord boundary, needsPaxHeaders linkname, createHeader isDir+longName, collectFiles empty dir) (2026-03-06)
- [x] ✅ [Docs] TSDoc for 22 LZMA_* constants, LZMAStatus members, LZMAFilter, XZFileIndex (2026-03-06)
- [x] ✅ [Refactor] Code health cleanup: collectStream helper, error constants unification, stripPath shared util, shellcheck fixes (2026-03-06)
- [x] ✅ [tar-xz] Remove dead `isUstarHeader` — deleted function, re-export, and tests (2026-03-01)
- [x] ✅ [Test] Duplicate root-level test files — FALSE POSITIVE, migration was complete (2026-03-01)
- [x] ✅ [Config] Enable `noUncheckedIndexedAccess` in tar-xz and nxz tsconfig (2026-03-01)
- [x] ✅ [Monorepo] Add `catalog:` in pnpm-workspace.yaml for shared devDeps (2026-03-01)
- [x] ✅ [Test] Add dedicated test for src/lzma.inline.ts — ensureInlineInit (2026-03-01)
- [x] ✅ [WASM] Audit test coverage for processStream (100%) and streamBufferDecode (70%→improved) (2026-03-01)
- [x] ✅ [API] Improve deprecation JSDoc on `messages` array — added @since 3.0.0 and @see (2026-03-01)

(Older completed → docs/historic/done-2026-02.md)

## Blocked / Deferred

_None_

## Reviewed / Closed (code-health 2026-03-06)

- [~] [Config] exactOptionalPropertyTypes — abandonné: bénéfice marginal pour une lib (catch explicit undefined assignment), coût élevé (breakage callbacks, options API). Pas rentable.
- [~] [WASM] flush/transform stream.ts — variance intentionnelle (Unxz track `finished` state)
- [~] [Shared] formatBytes — implémentations différentes (nxz: KiB/MiB vs demo: KB/MB)
- [~] [tar-xz] _write base class — identique mais trivial (10 LOC), pas rentable
- [~] [tar-xz] Types TarEntryType/TarEntryWithData/CreateHeaderOptions — dans l'API publique, pas unused
- [~] [API] xzFile/unxzFile — exportés, testés dans file-helpers.test.ts, absents du browser build
- [~] [tar-xz] Internal utils (calculateChecksum, parseOctal, writeChecksum) — déjà internes, pas dans index.ts

---

## Quick Reference

| Priority | Count | Status |
|----------|-------|--------|
| HIGH | 0 | Cleared |
| MEDIUM | 0 | Cleared |
| LOW | 0 | Cleared |

**Backlog vide.**

**Last release:** `tar-xz@6.0.0` + `nxz-cli@6.0.0` (2026-04-27) — stream-first universal API redesign, security hardening
**Last audit:** symlink/path TOCTOU exhaustive audit (18 vectors closed in single commit) (2026-04-27)
**Last story:** tar-xz v6 redesign — independent versioning proven in prod (`node-liblzma` still at 5.0.0) (2026-04-27)

**Independent versioning matrix (npm):**

| Package | Version |
|---------|---------|
| `node-liblzma` | 5.0.0 |
| `tar-xz` | 6.0.0 |
| `nxz-cli` | 6.0.0 |
