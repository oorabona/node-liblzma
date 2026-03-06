# Project Backlog

## In Progress

- [ ] 🟡 [Refactor] Code health audit cleanup — deduplicate, reduce complexity, unify constants (2026-03-06)

## Pending - HIGH

- [ ] 🔧 [tar-xz] Refactorer `processBuffer` extract/list (CC 54/34, sim 0.985) + `_write` (sim 0.988) — extraire logique commune — Priority: H (from code-health 2026-03-06)

## Pending - MEDIUM

- [ ] 🔧 [Config] Activer `exactOptionalPropertyTypes` dans packages/nxz et packages/tar-xz tsconfig — HIGH breakage risk on callback signatures, needs separate refactor story — Priority: M (from /review F-001, deferred from audit cleanup)
- [ ] 🔧 [WASM] Extraire `flush`/`transform` dupliqués dans WasmXzStream/WasmUnxzStream (sim 1.0) — Priority: M (from code-health 2026-03-06)
- [ ] 🔧 [tar-xz] Extraire `stripPath` en shared util browser/node (sim 0.997) — Priority: M (from code-health 2026-03-06)
- [ ] 🔧 [API] Unifier les constantes LZMA error — single source of truth (errors.ts vs wasm/types.ts, 11 groupes dupliqués) — Priority: M (from code-health 2026-03-06)

## Pending - LOW (Nice to Have)

- [ ] 💡 [Docs] Vérifier complétude des TSDoc sur l'API publique (typedoc bump)
- [ ] 💡 [Coverage] Investiguer les 5 branches partielles restantes (create.ts:2, format.ts:1, pax.ts:2)
- [ ] 🔧 [CLI] Refactorer les 4 fonctions haute complexité cognitive dans nxz.ts (determineMode, listTarFile, createTarFile, main) — Priority: L (from /review F-004)
- [ ] 🔧 [API] Deprecate `messages` array in src/lzma.ts — marked @deprecated with @since 3.0.0. Schedule removal for next major — Priority: L (from astix audit)
- [ ] 🔧 [API] Verify xzFile/unxzFile appear in documented API surface and have explicit test coverage (0 internal callers, public API only) — Priority: L (from astix audit)
- [ ] 💡 [tar-xz] Review exported internal utilities (calculateChecksum, parseOctal, writeChecksum, createPaxData, parsePaxData, applyPaxAttributes) — 0 external consumers, consider making internal-only to reduce API surface — Priority: L (from astix audit)
- [ ] 💡 [Pool] Inspect unreachable path in processQueue (3/4 paths reached) — dead guard condition or latent bug. Already has `v8 ignore` — Priority: L (from astix audit)
- [ ] 🔧 [Test] Extraire `collectStream` helper dupliqué (compat.test.ts vs stream.test.ts, sim 0.999) — Priority: L (from code-health 2026-03-06)
- [ ] 🔧 [Shared] Extraire `formatBytes` en util partagé (nxz.ts vs tar-xz/demo, sim 0.964) — Priority: L (from code-health 2026-03-06)
- [ ] 💡 [tar-xz] Nettoyer types non-utilisés: TarEntryType (0 callers), TarEntryWithData (0 callers), CreateHeaderOptions (0 callers) — Priority: L (from code-health 2026-03-06)
- [ ] 🔧 [Scripts] Fix shellcheck warnings — TIME_CMD unused (benchmark.sh:85), unquoted vars (check-size.sh:41-42) — Priority: L (from code-health 2026-03-06)

## Completed

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

---

## Quick Reference

| Priority | Count | Status |
|----------|-------|--------|
| HIGH | 1 | tar-xz processBuffer/extract dedup |
| MEDIUM | 4 | stream dedup, stripPath, error constants, exactOptionalPropertyTypes |
| LOW | 11 | Nice to have |

**Last audit:** code-health full audit (2026-03-06)
**Last story:** CI consolidation — release workflows + CHANGELOG backfill (2026-03-01)
