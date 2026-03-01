# Project Backlog

## In Progress

_None_

## Pending - HIGH

- [ ] 🔧 [Test] Remove duplicate root-level test files (8 files) — old copies from pre-migration (commit 4169971) still exist alongside test/unit/, test/integration/ etc. Doubles test runs and inflates coverage — Priority: H (from astix audit)
- [ ] 🐛 [tar-xz] Remove or wire `isUstarHeader` — exported from tar/format.ts but zero callers anywhere (source + tests). Either use in parseHeader or delete — Priority: H (from astix audit)

## Pending - MEDIUM

- [ ] 🔧 [Config] Activer exactOptionalPropertyTypes + noUncheckedIndexedAccess dans packages/nxz et packages/tar-xz tsconfig — Priority: M (from /review F-001)
- [ ] 🔧 [Monorepo] Introduire catalog: dans pnpm-workspace.yaml pour les devDeps partagées (typescript, vitest, biome, @types/node) — Priority: M (from /review F-002)
- [ ] 💡 [Test] Add dedicated test for src/lzma.inline.ts — inline WASM path (ensureInlineInit) has error recovery branch and double-init guard, both untested — Priority: M (from astix audit)
- [ ] 💡 [WASM] Audit test coverage for processStream (128 paths) and streamBufferDecode (64 paths) in src/wasm/bindings.ts — highest complexity functions in TS layer — Priority: M (from astix audit)

## Pending - LOW (Nice to Have)

- [ ] 💡 [Docs] Vérifier complétude des TSDoc sur l'API publique (typedoc bump)
- [ ] 💡 [Coverage] Investiguer les 5 branches partielles restantes (create.ts:2, format.ts:1, pax.ts:2)
- [ ] 🔧 [CLI] Refactorer les 4 fonctions haute complexité cognitive dans nxz.ts (determineMode, listTarFile, createTarFile, main) — Priority: L (from /review F-004)
- [ ] 🔧 [API] Deprecate `messages` array in src/lzma.ts:876 — marked @deprecated, 0 callers. Schedule removal for next major — Priority: L (from astix audit)
- [ ] 🔧 [API] Verify xzFile/unxzFile appear in documented API surface and have explicit test coverage (0 internal callers, public API only) — Priority: L (from astix audit)
- [ ] 💡 [tar-xz] Review exported internal utilities (calculateChecksum, parseOctal, writeChecksum, createPaxData, parsePaxData, applyPaxAttributes) — 0 external consumers, consider making internal-only to reduce API surface — Priority: L (from astix audit)
- [ ] 💡 [Pool] Inspect unreachable path in processQueue (3/4 paths reached) — dead guard condition or latent bug — Priority: L (from astix audit)

## Completed

(Archived → docs/historic/done-2026-02.md)

## Blocked / Deferred

_None_

---

## Quick Reference

| Priority | Count | Status |
|----------|-------|--------|
| HIGH | 2 | From astix audit |
| MEDIUM | 4 | Mixed sources |
| LOW | 7 | Nice to have |

**Last audit:** astix project analysis (2026-03-01)
**Last story:** CI consolidation — release workflows + CHANGELOG backfill (2026-03-01)
