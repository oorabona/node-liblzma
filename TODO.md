# Project Backlog

## In Progress

_None_

## Pending - HIGH

_None_

## Pending - MEDIUM

- [ ] 🔧 [Config] Activer `exactOptionalPropertyTypes` dans packages/nxz et packages/tar-xz tsconfig — HIGH breakage risk on callback signatures, needs separate refactor story — Priority: M (from /review F-001, deferred from audit cleanup)
- [ ] 🔧 [tar-xz] Refactorer `processBuffer` extract/list (CC 54/34) — state machines différentes (extract stocke contenu, list skip), extraire parsing header commun — Priority: M (demoted from H: base class not worth 10-line _write, focus on CC reduction)

## Pending - LOW (Nice to Have)

- [ ] 💡 [Docs] Vérifier complétude des TSDoc sur l'API publique (typedoc bump)
- [ ] 💡 [Coverage] Investiguer les 5 branches partielles restantes (create.ts:2, format.ts:1, pax.ts:2)
- [ ] 🔧 [CLI] Refactorer les 4 fonctions haute complexité cognitive dans nxz.ts (determineMode, listTarFile, createTarFile, main) — Priority: L (from /review F-004)
- [ ] 🔧 [API] Deprecate `messages` array in src/lzma.ts — marked @deprecated with @since 3.0.0. Schedule removal for next major — Priority: L (from astix audit)
- [ ] 🔧 [API] Verify xzFile/unxzFile appear in documented API surface and have explicit test coverage (0 internal callers, public API only) — Priority: L (from astix audit)
- [ ] 💡 [tar-xz] Review exported internal utilities (calculateChecksum, parseOctal, writeChecksum, createPaxData, parsePaxData, applyPaxAttributes) — 0 external consumers, consider making internal-only to reduce API surface — Priority: L (from astix audit)
- [ ] 💡 [Pool] Inspect unreachable path in processQueue (3/4 paths reached) — dead guard condition or latent bug. Already has `v8 ignore` — Priority: L (from astix audit)
- [ ] 💡 [tar-xz] Nettoyer types non-utilisés: TarEntryType (0 callers), TarEntryWithData (0 callers), CreateHeaderOptions (0 callers) — vérifier public API avant suppression — Priority: L (from code-health 2026-03-06)

## Completed

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

## Reviewed / Skipped (code-health 2026-03-06)

- [~] [WASM] flush/transform stream.ts — variance intentionnelle (Unxz track `finished` state), pas de dedup possible sans dégrader la lisibilité
- [~] [Shared] formatBytes — implémentations différentes (nxz: KiB/MiB binaire vs demo: KB/MB log-based), pas de vrai doublon
- [~] [tar-xz] _write base class — identique mais trivial (10 LOC), base class pour si peu n'est pas rentable

---

## Quick Reference

| Priority | Count | Status |
|----------|-------|--------|
| HIGH | 0 | Cleared |
| MEDIUM | 2 | exactOptionalPropertyTypes, processBuffer CC reduction |
| LOW | 8 | Nice to have |

**Last audit:** code-health full audit (2026-03-06)
**Last story:** Code health cleanup — dedup, constants, shellcheck (2026-03-06)
