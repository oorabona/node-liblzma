# Project Backlog

## In Progress

_None_

## Pending - HIGH

_None_

## Pending - MEDIUM

_None._

## Pending - LOW (Nice to Have)

- [ ] [Release] Consider `engines.node` bump from `>=22.0.0` to `>=22.13.0` when 22.0–22.12 usage drops — surfaced by Copilot round 2 on PR #116 ; deferred because library itself runs fine on 22.0+, the 22.13 floor only applies to the dev/release toolchain (release-it@20). Re-evaluate if anyone reports install warnings.
- [x] ✅ [nxz] Fix misleading example in `nxz --help` output — surfaced by Copilot round 3 on PR #133 (docs). The example `nxz -T -z dir/            create archive.tar.xz from dir/` claims output filename `archive.tar.xz` but the CLI actually derives `dir.tar.xz` from the input. Fixed in `packages/nxz/src/nxz.ts` (this PR).
<!-- F-002 (HARDLINK + undefined linkname → TypeError) DROPPED 2026-04-29 by Copilot round-2 review on PR #115: TarEntry.linkname is typed as required string (parser returns '' for empty fields), and ensureSafeLinkname → ensureSafeName already rejects '' with "empty linkname" before reaching resolve(). The original concern was mischaracterized — there is no path where resolve(cwd, undefined) gets called with undefined. -->


## Completed

- [x] ✅ [Refactor] **`parseMemlimitSize` cognitive complexity 17 → 2** (PR #120 squash `43c4d25`, 2026-04-30). Pure refactor in `packages/nxz/src/memlimit.ts` : extract-method on the previously dense parser ; three private helpers (`isZeroSynonym` CC=2, `parseSuffixed` CC=3, `parsePlainBytes` CC=1) + module-scope hoisting of multiplier maps and regex literals. Main function becomes a thin coordinator with a `??`-chain across the three branches. 29/29 vitest cases pass byte-identical (decimal rejection, mixed-case suffix, all-zero forms, whitespace, arbitrary-precision values >UINT64_MAX). Net diff +50/-48. Repo is now biome-clean (0 warnings). Closes the last Pending-LOW followup from #117 pre-push opus review.
- [x] ✅ [Lint] **Drop dead biome suppression in tar-xz node-api spec** (PR #119 squash `49c7f14`, 2026-04-30). Removed 1 line — the `// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional drain` above a `for await` drain loop whose body has a `/* drain */` comment that satisfies biome's check. Verified post-removal : `noEmptyBlockStatements` does not fire ; 0 new warnings.
- [x] ✅ [Release] **release-it-preset upstream tag baseline fix consumed** — bumped `@oorabona/release-it-preset` 0.11.0 → 0.12.0 (PR #118 squash `7ac6d05`, 2026-04-30). Consumes upstream issue [oorabona/release-it-preset#21](https://github.com/oorabona/release-it-preset/issues/21) → PR #22 (squash `d117cad`). New `resolveSinceBaseline()` detects per-package release commits matching `chore(<pkg>): release v*` and uses their SHA as the `since` baseline when `GIT_CHANGELOG_PATH` is set. Future workspace releases (`tar-xz`, `nxz-cli`) auto-scope CHANGELOG entries — eliminates the manual curation that nxz-cli@6.1.0 needed (commit `9e30af4`). Empirical dry-run from `packages/nxz/` produces zero diff (resolver correctly stops at `ecff028 chore(nxz-cli): release v6.1.0`).
- [x] ✅ [Release] **#26 — nxz-cli `--memlimit-decompress` + 6.1.0 release — closed** (PR #117 squash `2e3c25f`, release commit `ecff028`, npm published 2026-04-30). Pivoted from a metadata-only visibility bump to a real minor with new user-facing capability after audit revealed nxz CLI never surfaced the `LZMAOptions.memlimit` already supported by the library (PRs #111 WASM + #112 Native). New `--memlimit-decompress <SIZE>` CLI flag mirrors `xz` standard : integer mantissa, IEC (1024-based) and SI (1000-based) suffixes, all-zero forms (`0`, `0MiB`, `max`) → no limit, decimal mantissa rejected for parity. Helper `parseMemlimitSize(s: string): bigint | undefined` extracted to `packages/nxz/src/memlimit.ts` (side-effect-free, importable by tests). 36 vitest cases (29 direct parser + 7 CLI binary), 707 tests across workspace. **Review trail** : opus + Codex parallel (Copilot quota exhausted ; Codex substituted via `llm-delegate.sh --codex --mode review`) ; R1 found 1 S (decimal precision elevated by Codex) + 4 M ; fix-round 1 closed S/M-1/M-2/M-3 ; Codex R2 found M-4 (test imports CLI module that auto-runs main) ; fix-round 2 extracted helper to standalone module ; pre-push opus on cumulative 3-commit state returned SAFE-TO-PUSH ; admin-merged. CHANGELOG curated post-release : populate-script picked up too much history (uses root `latestTag` baseline rather than last per-package release — tracked as upstream follow-up TODO). Transitive notes added manually for tar-xz@6.1.0 streaming + Win32 TOCTOU benefits.
- [x] ✅ [Release] **#25 — Per-package CHANGELOG scoping (release-it) — closed** (PR #116 squash `68d6d91`, 2026-04-30). Future workspace-package releases (`tar-xz`, `nxz-cli`) produce CHANGELOGs scoped to commits whose diffs touch their own subtree. **Phase 1** : upstream `oorabona/release-it-preset` v0.11.0 (commit `0b4f857`) added opt-in `GIT_CHANGELOG_PATH` env var + 9 vitest cases incl. security validation (rejects `../`, absolute paths, shell metacharacters). **Phase 2** (this PR) : bumped preset 0.9.0 → 0.11.0, bumped `release-it` 19.2.4 → 20.0.1 to satisfy preset peerDep (Copilot M round 1), wired `GIT_CHANGELOG_PATH=.` inline on the workspace bump step in `release.yml` after `cd "$PKG_DIR"` (the `.` resolves to the package's own subtree), removed dormant changesets pipeline (workflow + `.changeset/` + 2 devDeps + ~90 transitive lockfile entries). Net diff : 7 files, +279/-1011 (-732 lines after fix-round 1 lockfile). Senior reviewer opus pre-push verdict : SAFE-TO-MERGE 0 S/0 M/3 L. 2 Copilot review rounds : R1=2 findings (1 M peer dep + 2 L cosmetic), R2=1 L (engines.node) classified-and-rejected with rationale on PR thread. Resolves "changesets vs release-it" architecture question raised 2026-04-27 (`adfbc99`) → cleanup `4d24fde` left noise problem unsolved. Body-fragment parser issue tracked separately upstream as v0.11+ "Out-of-scope follow-up" in preset's TODO.
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
- [x] ✅ [Refactor] Rename `nxz-cli` → `nxz` (7.0.0 major bump) — package.json, help text fix, all doc/workflow refs updated — closes PR #<TBD>
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
| MEDIUM | 0 | Cleared (#25 + #26 closed) |
| LOW | 1 | engines.node bump consideration (deferred — wait-and-see) |

**Last merge:** PR #120 squash `43c4d25` (2026-04-30) — `refactor(nxz)`: split `parseMemlimitSize` via extract-method (CC 17→2) ; repo now biome-clean.
**Last release:** `nxz@7.0.0` (rename from `nxz-cli`, major bump, help text fix) — closes PR #<TBD>.
**Last audit:** all post-#117 follow-ups merged (PR #118 preset 0.12.0 ; PR #119 dead biome-ignore removal ; PR #120 parseMemlimitSize CC refactor). Repo is biome-clean (0 warnings) and 707 tests green.
**Last story arc:** #25 + #26 + 4 follow-ups end-to-end — per-package CHANGELOG scoping (cross-repo) → `--memlimit-decompress` feature → release v6.1.0 → upstream tag-baseline fix consumption → biome cleanup → parser CC refactor. Cross-LLM reviewing pattern (Codex substituted for Copilot quota) rodé.

**Independent versioning matrix (npm):**

| Package | Version |
|---------|---------|
| `node-liblzma` | 5.0.0 |
| `tar-xz` | 6.1.0 |
| `nxz` | 7.0.0 |
