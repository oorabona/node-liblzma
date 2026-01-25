# Project Backlog

## In Progress

_None_

## Pending - BLOCKING (Must Fix Before Release)

> Source: [Multi-LLM Audit 2026-01-24](docs/audits/2026-01-24-multi-llm-review.md)

_None - All blocking issues resolved_

## Pending - MEDIUM (Should Fix)

_None - All MEDIUM issues resolved_

## Pending - LOW (Nice to Have)

_None - All LOW issues resolved_

## Completed

- [x] ✅ Project initialized with /project-init (2026-01-24)
- [x] ✅ Multi-LLM code review completed (2026-01-24)
  - Codex on C++ and TypeScript
  - Gemini on C++ and TypeScript
  - Audit document: `docs/audits/2026-01-24-multi-llm-review.md`
- [x] ✅ **F-001** Race condition fix - _wip guard + callback timing (2026-01-24)
  - Guard at `node-liblzma.cpp:166-172`, reset before callback at `:533`
- [x] ✅ **F-002** Output offset bounds validation (2026-01-24)
  - Bounds check at `node-liblzma.cpp:295-301`
- [x] ✅ **F-003** Async error path via onerror event (2026-01-24)
  - Emit onerror in async callback at `lzma.ts:514-516`
- [x] ✅ **F-004** Async callback cleanup ensured (2026-01-24)
  - AfterCommon() always runs after callback at `node-liblzma.cpp:557`
- [x] ✅ **F-005** Decoder init failure throws exception (2026-01-24)
  - InitializeDecoder now takes env parameter and throws at `node-liblzma.cpp:121-127`
- [x] ✅ **F-006** External memory accounting idempotency (2026-01-24)
  - Added `_closed` guard at `node-liblzma.cpp:32-37`
- [x] ✅ **F-007** Error suppression pattern removed (2026-01-24)
  - Removed defensive listener at `lzma.ts:279-284`
- [x] ✅ **F-008** LZMAPool.clearQueue() rejects promises (2026-01-24)
  - Reject queued tasks with error at `pool.ts:224-228`
- [x] ✅ **F-009** Type-safe _writableState access (2026-01-24)
  - Added WritableState interface at `lzma.ts:63-70` (no public API equivalent for .ended)
- [x] ✅ **F-010** Exception guard in processQueue() (2026-01-24)
  - Promise.resolve().then() pattern at `pool.ts:175`
- [x] ✅ **F-011** Explicit errno error messages (2026-01-24)
  - Returns "Unknown LZMA error code: X" for out-of-bounds at `errors.ts:175-177`
- [x] ✅ **F-012** close() in finally block (2026-01-24)
  - try/finally in sync path at `lzma.ts:360-369`
- [x] ✅ **F-013** PresetType as number with docs (2026-01-24)
  - Changed from union to `number` with comment at `types.ts:28-30`
- [x] ✅ **F-014** Deprecation notice on default export (2026-01-24)
  - JSDoc deprecation added at `lzma.ts` (end of file)
- [x] ✅ **DX-UTILS** Add utility functions for better DX (2026-01-25)
  - `isXZ(buffer)` - Format detection at `module.cpp:30-50`
  - `versionString()` / `versionNumber()` - Library version at `module.cpp:56-70`
  - `easyEncoderMemusage(preset)` - Memory estimation at `module.cpp:77-91`
  - `easyDecoderMemusage()` - Memory estimation at `module.cpp:97-106`
  - `parseFileIndex(buffer)` - Read .xz metadata at `module.cpp:113-206`
  - TypeScript wrappers at `lzma.ts:756-845`
  - 22 tests added in `test/utils.test.ts`

## Blocked / Deferred

_None_

---

## Scope-Specific Backlogs

_As scopes grow, create dedicated TODO_<SCOPE>.md files:_
- `TODO_NATIVE.md` - Native bindings development
- `TODO_API.md` - API development
- `TODO_TESTS.md` - Test coverage improvements

---

## Quick Reference

| Priority | Count | Status |
|----------|-------|--------|
| BLOCKING | 0 | ✅ All resolved |
| MEDIUM | 0 | ✅ All resolved |
| LOW | 0 | ✅ All resolved |
| **Total** | **0** | ✅ Clean backlog |

**Next action:** All audit findings resolved. Ready for release.
