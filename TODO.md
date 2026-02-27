# Project Backlog

## In Progress

_None_

## Pending - HIGH

_None_

## Pending - LOW (Nice to Have)

- [x] ✅ [Lint] Audit nouvelles règles biome 2.4.0 après merge PR #65 (2026-02-28)
- [ ] 💡 [Docs] Vérifier complétude des TSDoc sur l'API publique (typedoc bump)
- [ ] 💡 [Coverage] Investiguer les 5 branches partielles restantes (create.ts:2, format.ts:1, pax.ts:2)

## Completed

- [x] ✅ [Tests] Réorganiser les 23 fichiers de test en sous-dossiers (unit/, integration/, native/, cli/, exports/) (2026-02-27)
- [x] ⏭️ [CLI] Contrat compile-time CLI → tar-xz — reverted (build-order circular dep) (2026-02-28)
- [ ] 🔧 [CLI] Déplacer src/cli/nxz.ts → packages/nxz/src/ pour casser le cycle de build et activer import type from 'tar-xz'
- [x] ✅ [Config] Bumper engines.node >=16 → >=20 dans les 3 packages (2026-02-27)
- [x] ✅ [Deps] Merge PR #65 — biome 2.4.0, @types/node, typedoc (2026-02-27)

(Archived → docs/historic/done-2026-02.md)

## Blocked / Deferred

_None_

---

## Quick Reference

| Priority | Count | Status |
|----------|-------|--------|
| HIGH | 0 | Done |
| LOW | 3 | Nice to have |

**Last story:** WASM Browser Support — v3.0.0 (2026-02-01)
