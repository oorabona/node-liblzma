# Project Backlog

## In Progress

_None_

## Pending - HIGH

_None_

## Pending - MEDIUM

- [ ] 🔧 [Config] Activer `exactOptionalPropertyTypes` dans packages/nxz et packages/tar-xz tsconfig — HIGH breakage risk on callback signatures, needs separate refactor story — Priority: M (from /review F-001, deferred from audit cleanup)

## Pending - LOW (Nice to Have)

- [ ] 💡 [Docs] Vérifier complétude des TSDoc sur l'API publique (typedoc bump)
- [ ] 💡 [Coverage] Investiguer les 5 branches partielles restantes (create.ts:2, format.ts:1, pax.ts:2)
- [ ] 🔧 [CLI] Refactorer les 4 fonctions haute complexité cognitive dans nxz.ts (determineMode, listTarFile, createTarFile, main) — Priority: L (from /review F-004)
- [ ] 🔧 [API] Deprecate `messages` array in src/lzma.ts — marked @deprecated with @since 3.0.0. Schedule removal for next major — Priority: L (from astix audit)
- [ ] 🔧 [API] Verify xzFile/unxzFile appear in documented API surface and have explicit test coverage (0 internal callers, public API only) — Priority: L (from astix audit)
- [ ] 💡 [tar-xz] Review exported internal utilities (calculateChecksum, parseOctal, writeChecksum, createPaxData, parsePaxData, applyPaxAttributes) — 0 external consumers, consider making internal-only to reduce API surface — Priority: L (from astix audit)
- [ ] 💡 [Pool] Inspect unreachable path in processQueue (3/4 paths reached) — dead guard condition or latent bug. Already has `v8 ignore` — Priority: L (from astix audit)

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
| HIGH | 0 | Cleared |
| MEDIUM | 1 | exactOptionalPropertyTypes deferred |
| LOW | 7 | Nice to have |

**Last audit:** astix project audit cleanup (2026-03-01)
**Last story:** CI consolidation — release workflows + CHANGELOG backfill (2026-03-01)
