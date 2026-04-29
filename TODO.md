# Project Backlog

## In Progress

- [ ] 🟡 [Release] **#25 — Per-package CHANGELOG scoping (release-it)** (2026-04-29). Pollution observed in `packages/tar-xz/CHANGELOG.md` v6.1.0: node-liblzma commits leak (#111 wasm, #112 native), ~30 Dependabot lockfile refreshes, repo-wide CI tweaks, commit-body fragments parsed as entries. Root cause: `populate-unreleased-changelog.ts` git log has no path filter. Decision 2026-04-29: opt-in env var in `@oorabona/release-it-preset` (single source of truth, ~5 LOC upstream + ~15 LOC test). Resolves "changesets vs release-it" architecture question (originally raised 2026-04-27 commit `adfbc99` → cleanup `4d24fde` left the noise problem unsolved).
  - [x] ✅ **Phase 1** — `oorabona/release-it-preset` v0.11.0 shipped (2026-04-29, upstream commit `0b4f857` tag `v0.11.0`, npm published). `GIT_CHANGELOG_PATH` env var wired in `dist/scripts/populate-unreleased-changelog.js:184` via existing `deps.getEnv()` DI pattern. 9 vitest cases covering path scoping + security validation (rejects `../` traversal + absolute paths — bonus security hardening not in original spec). Multi-line commit body parser issue tracked separately as v0.11+ "Out-of-scope follow-up" in preset's TODO.
  - [ ] 🟡 **Phase 2** — node-liblzma (this repo): bump `@oorabona/release-it-preset` 0.9.0 → 0.11.0, set `GIT_CHANGELOG_PATH=. (relative to cwd after cd "$PKG_DIR") inline on the workspace bump step in release.yml — same env var per package since the cwd is per-package`. Remove dormant changesets pipeline: `.github/workflows/changesets.yml` (62 LOC), `.changeset/` dir (config.json + README.md only post-cleanup), `@changesets/cli`+`@changesets/changelog-github` devDeps (~90 transitive lockfile entries). Dry-run `release.yml` for tar-xz to verify CHANGELOG no longer captures node-liblzma/Dependabot commits before merge.

## Pending - HIGH

_None_

## Pending - MEDIUM

_None._

## Pending - LOW (Nice to Have)

- [ ] [Release] **#26 — nxz-cli 6.0.0 → 6.1.0 visibility bump** — blocked on #25 Phase 2. 0 nxz-specific code changes since v6.0.0 verified (`git log -- packages/nxz/` between `adfbc99` and HEAD `9f37d1a`); npm `nxz-cli@6.0.0` already pulls `tar-xz@6.1.0` transitively via `^6.0.0`. Bump is metadata-only for CHANGELOG/lockfile signal. Trigger: `gh workflow run release.yml -f target_package=nxz-cli -f increment=patch` after Phase 2 publishes. Sequencing rationale: avoid creating a polluted nxz CHANGELOG entry that #25 fix would otherwise have to revert/rewrite.
- [ ] [Lint] Single residual biome warning: `test/node-api.spec.ts:249` (`suppressions/unused` — pre-existing biome-ignore that no longer suppresses anything). Cosmetic 1-line cleanup for a future PR.
<!-- F-002 (HARDLINK + undefined linkname → TypeError) DROPPED 2026-04-29 by Copilot round-2 review on PR #115: TarEntry.linkname is typed as required string (parser returns '' for empty fields), and ensureSafeLinkname → ensureSafeName already rejects '' with "empty linkname" before reaching resolve(). The original concern was mischaracterized — there is no path where resolve(cwd, undefined) gets called with undefined. -->


## Completed

- [x] ✅ [Refactor] **Biome warnings sweep + cognitive-complexity extract-method — story REFACTOR-BIOME-2026-04-29 closed** (PR #115 squash `ad2e18f`, 2026-04-29). Pure refactor sweep across the workspace: **63 → 1 biome warnings (-98.4%)**. 5 phases: biome --write auto-fix (Phase 2, -23), manual noNonNullAssertion + cycle-ignore + useForOf (Phases 3+4, -26), test extract-method (Phase 5a, -8), low-risk src extract (Phase 5b-1, -3), HIGH-RISK security/streaming src extract (Phase 5b-2, -2). 11 helpers extracted in Phase 5b-2 alone (extractSymlinkEntry, extractHardlinkEntry, openFileExclusive, writeFileEntryPosix/Win32, writeFileEntry, ensureSafeLinkname for file.ts; nextParseEvent, drainEntryChunks, drainSkippedEntry, createEntryDataPull for extract.ts). Win32 TOCTOU contract preserved byte-identical (em-dash U+2014 in security error verbatim). Pre-push opus senior-review verdict: SAFE-TO-PUSH. **6 Copilot review rounds, 13 findings folded** (1→3→1→1→2→3 — last 3 were L-only comment-precision; class breakdown: 5 fail-fast invariant patterns, 2 doc/comment drift, 2 type-narrowing semantics, 4 stale doc pointers). 671 tests stable throughout. 1 residual warning is pre-existing unrelated (`test/node-api.spec.ts:249`). Net diff: 20 files / +808/-499. ~3h wall-clock.
- [x] ✅ [tar-xz] **Win32 symlink-swap TOCTOU hardening — story WIN32-TOCTOU-2026-04-29 closed** (PR #114 squash `b24040d`, 2026-04-29). JS-pure `'wx'`+retry fail-closed pattern in `extractFile` Win32 branch (no native addon expansion). fd-based `chmod`/`utimes` (best-effort wrap on Win32 to preserve master's FAT32/cloud-share semantics). Recon invalidated original "match node-tar with CreateFileW" framing — node-tar is pure JS and explicitly Unix-only (PR #456). 4 BDD scenarios + observable-proof byte-equality assertion + reparse-tag coverage table (SYMLINK / MOUNT_POINT / CLOUD_FILES) in SECURITY.md. Adversarial pass on 5 Win32 vectors (1 M folded, 4 L/None confirmed). 6 Copilot review rounds, **21 findings folded** (3 M → 1 M → 0 M for code; remainder L/cosmetic). 155/0 tests, 0 lint, 0 typecheck. Total wall-clock ~150 min, 6 implementer dispatches + 1 senior-review opus.
- [x] ✅ [tar-xz] **True streaming for Node `extract()`/`list()` — story TAR-XZ-STREAMING-2026-04-28 closed** (PR #113 squash `06a9937`, 2026-04-29). Memory now O(largest single entry) instead of O(archive). 5 vertical blocks: streamXz foundation, parseTar AsyncGenerator core (3 v8-ignore paths now exercised), extract/list rewrites, security regression gate (18 TOCTOU + S-14/S-15 PAX bomb), memory-shape gate. 26 new tests + opus adversarial (13 findings) + LLM-spec consensus (Codex/Copilot, 9 findings) + 4 Copilot review rounds (round 1 = 0, round 2 post-restart = 9, round 3 = 2, round 4 = 0) + 2 pre-push opus (both SAFE-TO-PUSH) + 1 CI hotfix (TS 6 lib.esnext AsyncGenerator drift). MAX_PAX_HEADER_BYTES=1MB DoS guard. tar-xz 6.1.0 minor bump. Closes "planned optimization" advertised by README v6.0.0.
- [x] ✅ [Native] PR #112 Round 2 Copilot fixes — C-2-001 MAX_SAFE_INTEGER guard in Number branch (d > 9007199254740991.0 → TypeError, defense-in-depth comment), C-2-002 else-branch for wrong-type memlimit (string/object/array → TypeError "memlimit must be a Number or BigInt"); sibling pattern: InitializeEncoder uses if(!IsNumber){throw} — same strictest pattern mirrored; gyp+tsc+lint+15 native+full suite pass (2026-04-28)
- [x] ✅ [Native] PR #112 Round 1 Copilot fixes — F-3/C-1/C-2 C++ defense-in-depth throw on lossless=false/out-of-range (was silent UINT64_MAX fallback), C-3 error message context-neutral, C-6 TSDoc coercion wording, F-1 ResolvedLZMAOptions stale TSDoc, F-2 encoder memlimit comment, C-4/C-5 changeset wording; GAP test encoder ignores memlimit; gyp+tsc+lint+15 native+full suite pass (2026-04-28)
- [x] ✅ [Native] Wire `memlimit` in `InitializeDecoder` — `.hpp` signature updated, `node-gyp rebuild` clean, 14/14 memlimit tests pass, 488+99+27=614 total tests pass (2026-04-28)
- [x] ✅ [WASM] `validateMemlimit` symmetry — bigint UINT64_MAX upper-bound guard (closed alongside native memlimit PR) (2026-04-28)
- [x] ✅ [WASM] PR #111 Round 3 Copilot fixes — C-3-001/2/3 duplicate JSDoc blocks removed from decoderInit/autoDecoderInit/validateMemlimit, C-3-004 stale xzAsync/unxzAsync comment fixed in lzma.ts:370; tsc+memlimit+full suite pass (2026-04-28)
- [x] ✅ [WASM] PR #111 Round 2 Copilot fixes — C-2-001 TSDoc xzAsync removed from honored-by list, C-2-002 stale lzma.ts comment, C-2-003 LZMA_OPTIONS_ERROR constant replaces magic 8, C-2-004 MAX_SAFE_INTEGER guard + TSDoc, C-2-005 validateMemlimit lifted to decoderInit+autoDecoderInit; 12 new tests, 474+99+27=600 tests pass (2026-04-28)
- [x] ✅ [WASM] PR #111 Round 1 review fixes — F-001 memlimit validation (NaN/Inf/frac/neg → LZMAOptionsError), F-002 ResolvedLZMAOptions internal type, C-001/C-002 async callback fixture pattern, C-003 byte-equality assertion, F-003 TSDoc reorder, F-004 stale comment, F-005 fixture comment magnitude, F-006 default-path caveat; 4 new tests (12 total in decompress-memlimit.test.ts), 458+99+27=584 tests pass (2026-04-28)
- [x] ✅ [WASM] Wire `memlimit` through `LZMAOptions` → `unxzAsync`/`unxz` — `LZMAMemoryLimitError` thrown when limit exceeded; 8 new tests in `test/wasm/decompress-memlimit.test.ts`; TSDoc with parity note (2026-04-28)
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
| MEDIUM | 1 (in progress) | #25 release-it CHANGELOG scoping — Phase 1 ✅ shipped (preset v0.11.0); Phase 2 ready to start |
| LOW | 2 | #26 nxz-cli visibility bump (blocked on #25); biome residual |

**Last merge:** PR #115 squash `ad2e18f` (2026-04-29) — Biome warnings sweep + cognitive-complexity extract-method (63→1 warnings, pure refactor, behavior-preserving).
**Last audit:** opus pre-push SAFE-TO-PUSH + 6 Copilot review rounds (13 findings folded; last 3 = L-only comment precision) on PR #115 (2026-04-29).
**Last story:** REFACTOR-BIOME-2026-04-29 — 5 phases, 8 commits squashed, ~3h wall-clock, 13 Copilot findings folded.

**Independent versioning matrix (npm):**

| Package | Version |
|---------|---------|
| `node-liblzma` | 5.0.0 |
| `tar-xz` | 6.0.0 |
| `nxz-cli` | 6.0.0 |
