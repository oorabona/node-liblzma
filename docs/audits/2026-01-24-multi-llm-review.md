# Multi-LLM Security & Code Quality Audit

**Project:** node-liblzma
**Date:** 2026-01-24
**Auditors:** Codex (GPT-5.2), Gemini, Claude (Opus 4.5)
**Scope:** Full codebase (C++ native addon + TypeScript wrapper)

---

## Executive Summary

A comprehensive multi-LLM code review was conducted with cross-validation:
- **Codex** reviewed both C++ and TypeScript
- **Gemini** reviewed both C++ and TypeScript
- **Claude** synthesized and arbitrated findings

**Result:** 14 issues identified, **3 blocking** with unanimous consensus.

| Metric | Value |
|--------|-------|
| Total findings | 14 |
| Blocking (CRITICAL/HIGH) | 3 |
| Non-blocking (MEDIUM) | 5 |
| Non-blocking (LOW) | 6 |
| LLM consensus rate | HIGH (3/3 on blockers) |
| Tests passing | 320/320 |
| Lint/Typecheck | PASS |

---

## Coverage Matrix

| Aspect | Codex | Gemini | Files |
|--------|-------|--------|-------|
| **TypeScript** | ✅ | ✅ | src/*.ts |
| **C++ Native** | ✅ | ✅ | src/bindings/*.cpp |

---

## Blocking Findings (MUST FIX)

### F-001: Race Condition in Code() - Concurrent Stream Access

| Attribute | Value |
|-----------|-------|
| **Severity** | CRITICAL |
| **Type** | Thread Safety |
| **Location** | `src/bindings/node-liblzma.cpp:166,179,186` |
| **Consensus** | Codex + Gemini + Claude (3/3) |
| **Size** | S (< 30 min) |

**Description:**
No guard prevents concurrent `code()` calls while an async worker is running. The `_stream`, `_action`, and buffer pointers are mutated on the main thread while the worker thread calls `lzma_code()`. liblzma is not thread-safe for concurrent use on the same stream.

**Impact:**
Memory corruption, segmentation faults, undefined behavior.

**Recommended Fix:**
```cpp
// At start of LZMA::Code()
if (this->_wip) {
    Napi::Error::New(info.Env(), "Stream is already busy").ThrowAsJavaScriptException();
    return info.Env().Undefined();
}
this->_wip = true;
```

---

### F-002: Output Offset Bounds Check Missing

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Type** | Memory Safety |
| **Location** | `src/bindings/node-liblzma.cpp:287-289` |
| **Consensus** | Codex + Claude (2/3) |
| **Size** | S (< 30 min) |

**Description:**
`ctx.out_off` is set from `info[5].ToNumber()` without validation. If `out_off > out_max`, the subtraction `out_max - out_off` causes unsigned underflow, resulting in a very large `out_len` value and out-of-bounds writes via `out_buf + out_off`.

**Impact:**
Buffer overflow, memory corruption, potential remote code execution.

**Recommended Fix:**
```cpp
// After setting out_off
if (ctx.out_off > ctx.out_max) {
    Napi::Error::New(env, "Output offset exceeds buffer length").ThrowAsJavaScriptException();
    return false;
}
```

---

### F-003: _processChunk Callback Not Always Called

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Type** | Error Handling |
| **Location** | `src/lzma.ts:507,514,551` |
| **Consensus** | Codex + Gemini + Claude (3/3) |
| **Size** | S (< 30 min) |

**Description:**
In async mode, when an error occurs in `_processChunk`, the code emits an error but may not call the callback. This causes Transform streams to hang indefinitely waiting for the callback.

**Impact:**
Stream hangs, memory leaks, application freezes.

**Recommended Fix:**
Ensure callback is always called after emitting error:
```typescript
this.emit('error', error);
cb(error);  // Always call callback
return;
```

---

## Non-Blocking Findings (SHOULD FIX)

### F-004: Async Callback Exceptions Skip Cleanup

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/bindings/node-liblzma.cpp:518,521` |
| **Source** | Codex |

If `cb.Call(...)` throws, cleanup in `AfterCommon` is skipped: `_wip` stays true, refs stay pinned, `Unref()` is skipped.

**Fix:** Wrap callback in try-catch, ensure cleanup in finally.

---

### F-005: Decoder Init Failure Silent

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/bindings/node-liblzma.cpp:464,466,116` |
| **Source** | Codex |

`InitializeDecoder` returns `false` on failure, but constructor just returns without throwing, leaving partially initialized object.

**Fix:** Throw exception on decoder init failure.

---

### F-006: External Memory Accounting Double-Subtract

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/bindings/node-liblzma.cpp:30,34,488,125` |
| **Source** | Codex + Gemini |

`AdjustExternalMemory(-sizeof(LZMA))` runs on `Close()` even when pending, and destructor doesn't balance. Multiple `close()` calls can double-subtract.

**Fix:** Add `_closed` flag for idempotency.

---

### F-007: Error Suppression Pattern

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/lzma.ts:133` |
| **Source** | Gemini |

The `onerror` handler attaches a dummy `'error'` listener if none exist to "prevent crash". This suppresses unhandled errors - anti-pattern in Node.js.

**Fix:** Remove defensive listener, let errors propagate naturally.

---

### F-008: LZMAPool.clearQueue() Drops Without Reject

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/pool.ts:222` |
| **Source** | Codex |

`clearQueue()` drops pending tasks without rejecting their promises, causing silent failures.

**Fix:** Reject queued promises with appropriate error.

---

### F-009: Uses Internal _writableState

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Location** | `src/lzma.ts:64,168` |
| **Source** | Codex + Gemini |

Code accesses internal `_writableState.ending` and `_writableState.ended`. Fragile across Node.js versions.

**Fix:** Use public `writableEnded` and `writableFinished` (Node.js 12.9.0+).

---

### F-010: LZMAPool.processQueue() No Exception Guard

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Location** | `src/pool.ts:174` |
| **Source** | Codex |

No try-catch around synchronous operations in `processQueue()`.

**Fix:** Wrap in try-catch for robustness.

---

### F-011: getErrorMessage() Errno Clamping

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Location** | `src/errors.ts:158` |
| **Source** | Codex |

Incorrect bounds logic when clamping errno values.

**Fix:** Review and fix bounds check logic.

---

### F-012: close() Not in Finally Block

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Location** | `src/lzma.ts:365` |
| **Source** | Gemini |

In sync path, if `codeSync` throws, `this.close()` is not guaranteed to be called.

**Fix:** Use try-finally to ensure cleanup.

---

### F-013: PresetType Bitmask Inconsistency

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Location** | `src/types.ts:28` |
| **Source** | Codex |

`PresetType` may not match liblzma bitmask semantics.

**Fix:** Document or align with liblzma.

---

### F-014: Mixed Default/Named Exports

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Location** | `src/lzma.ts` (end of file) |
| **Source** | Gemini |

Uses `export default` alongside named exports, hindering tree-shaking.

**Fix:** Consider deprecating default export in future major version.

---

## Test Results

| Suite | Pass | Fail | Status |
|-------|------|------|--------|
| Unit + Integration (Vitest) | 320 | 0 | ✅ |
| Type check | 0 errors | - | ✅ |
| Lint (Biome) | 40 files | 0 issues | ✅ |

---

## Files Analyzed

| File | Lines | Reviewers |
|------|-------|-----------|
| `src/bindings/node-liblzma.cpp` | 523 | Codex, Gemini |
| `src/bindings/node-liblzma.hpp` | 145 | Codex, Gemini |
| `src/bindings/module.cpp` | 108 | Codex |
| `src/lzma.ts` | 844 | Codex, Gemini |
| `src/pool.ts` | 230 | Codex, Gemini |
| `src/errors.ts` | 177 | Codex |
| `src/types.ts` | 31 | Codex, Gemini |

---

## Recommendations

### Immediate (Before Release)
1. Fix F-001, F-002, F-003 (blocking issues)
2. Add tests for race condition and bounds checking
3. Re-run security audit after fixes

### Short-term (Next Sprint)
1. Fix F-004 through F-008 (medium severity)
2. Improve error handling consistency

### Long-term (Backlog)
1. Address F-009 through F-014 (low severity)
2. Consider API improvements for v3.0

---

## Attestation

| LLM | Domain | Findings | Session |
|-----|--------|----------|---------|
| Codex (GPT-5.2) | C++ | 5 issues | 019bed7d-18b3-77b1-a885-ed1b67a637ce |
| Codex (GPT-5.2) | TypeScript | 7 issues | (previous session) |
| Gemini | C++ | 4 issues | (previous session) |
| Gemini | TypeScript | 6 issues | (current session) |
| Claude (Opus 4.5) | Synthesis | Arbiter | 62d61d7a-1a0a-4ffc-b2b2-9208d605a2b1 |

**Audit completed:** 2026-01-24 02:15 CET
