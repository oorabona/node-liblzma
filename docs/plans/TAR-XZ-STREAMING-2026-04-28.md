---
doc-meta:
  status: draft
  story_id: TAR-XZ-STREAMING-2026-04-28
  created: 2026-04-28
  adversarial_applied: true
  adversarial_date: 2026-04-28
  llm_consensus_applied: true
  llm_consensus_date: 2026-04-28
  llm_consensus_llms: [codex, copilot]
  llm_consensus_gemini_status: errored
---

# TAR-XZ True Streaming Refactor

## §1 Scope

**What changes:** Replace the three-stage O(archive) accumulation pipeline in
`packages/tar-xz/src/node/xz-helpers.ts` and the `Writable`-based `TarUnpack`/`TarList`
classes with a unified `async function* parseTar()` generator that processes the XZ
decompression stream incrementally, yielding entries as they are parsed without holding the
full archive in memory.

**What stays the same:**
- Public API: `extract(input, options?)` and `list(input)` signatures unchanged
  (`AsyncIterable<TarEntry(WithData)>`)
- `TarEntryWithData` interface: `data`, `bytes()`, `text()` unchanged
- `tar-xz/file` subpath helpers (`extractFile`, `listFile`, `createFile`) — NOT modified
- `parseNextHeader()` and all `src/tar/` utilities — reused as-is, NOT modified
- Browser/WASM path (`src/browser/`, `src/index.browser.ts`) — out of scope
- `create()` function — out of scope (already streaming)

**Memory target:** O(largest single entry). For a 1 GB archive with 100 MB entries,
peak heap ≈ 100 MB, not ≈ 1 GB.

---

## §2 Reality Constraints

### §2.1 Security surface — 18 TOCTOU vectors must remain closed

PR #108 (2026-04-27) closed 18 security vectors in `packages/tar-xz/src/node/file.ts`.
All are enforced in `extractFile()`, which operates on `TarEntryWithData` objects yielded
by `extract()`. The refactor touches `extract.ts`, `list.ts`, and `xz-helpers.ts` only.
`file.ts` is NOT modified.

Security invariants that depend on correct parser output:
- **V1/R6-1** — leaf symlink check: requires correct `entry.type`
- **R4-2/R5-1** — hardlink TOCTOU: requires correct `entry.linkname`
- **V6a/V6b** — NUL/empty rejection: requires `entry.name` faithful to PAX `path` attribute
- **F-001** — traversal check: requires full PAX-extended names (not 100-char truncated names)

All validated against parsed `TarEntry` fields. Parser is unchanged.

### §2.2 PAX/GNU format correctness

`tar-parser.ts:consumePaxHeader()` (line 139–159) already implements re-entrancy: when PAX
payload is split across XZ chunk boundaries, it returns the header block to `state.buffer`
and emits `need-more-data`. This code is correct but currently unreachable (single-buffer
feed). Streaming will promote it to a hot path. Must be covered by S-05 test.

### §2.3 Backpressure semantics

Consumer `for await` on `extract()` controls decompression rate. Consumer must drain
`entry.data` before advancing to next entry (same contract as tar-stream/it-tar). If
consumer does not drain, the `parseTar` generator must drain internally before parsing the
next header (S-08). No explicit pause/resume needed — `AsyncGenerator` suspension handles
backpressure naturally.

### §2.4 Out of scope

- Browser/WASM path
- Sparse file support (GNU sparse headers)
- GNU `@LongLink` extension (PAX is the only extension in current code)
- Concurrent entry consumption (explicitly forbidden)

---

## §3 Current State

### §3.1 The accumulation chain — three stages, all O(archive)

**Stage 1** — `xz-helpers.ts:12–27` `collectAllChunks()`:
Collects ALL compressed bytes into one `Uint8Array` before decompression begins.

**Stage 2** — `xz-helpers.ts:30–64` `decompressXz()`:
Decompresses ALL bytes into a second `Uint8Array`. For 1 GB `.tar.xz` (10:1 ratio):
produces ≈10 GB on heap.

**Stage 3** — `xz-helpers.ts:67–74` `runWritable()`:
Writes the entire decompressed buffer in one `writable.write()` call. The
`Buffer.concat([this.state.buffer, chunk])` at `extract.ts:59` fires with an empty left
side — the real problem is stages 1 and 2.

**Stage 4** (within-entry) — `extract.ts:91` `Buffer.concat(this.contentChunks)`:
Concats chunks for the current entry. Eliminated in streaming model (chunks yielded
directly). `list.ts` has no equivalent (content is discarded).

### §3.2 Parser state machine — already streaming-ready

`tar-parser.ts:parseNextHeader()` (line 83–133):
- Returns `need-more-data` when `state.buffer.length < BLOCK_SIZE` (line 87)
- Returns header block to buffer on PAX split (line 151–153)
- Advances `state.buffer` via zero-copy `subarray()`
- All state in `HeaderParserState` — reentrant and stateless across calls

`extract.ts:processBuffer()` (line 121–130) and `list.ts:processBuffer()` (line 55–63)
are correctly structured incremental parsers receiving artificially-complete input.

**Conclusion:** The parser does not change. Only the data feed mechanism changes.

### §3.3 `TarEntryWithData.data` — type contract already correct

`extract.ts:makeTarEntryWithData()` (line 19–40) returns:
```typescript
data: (async function* () { if (u8.length > 0) yield u8; })()
```
`file.ts:extractFile` iterates it with `for await (const chunk of entry.data)` (line 297).
The streaming refactor changes what the generator yields, not the type. Zero API changes.

### §3.4 `v8 ignore` blocks that streaming will activate

`tar-parser.ts:86–89` — chunk boundary splitting a 512-byte header (currently unreachable)
`tar-parser.ts:148–153` — PAX payload split across XZ chunks (currently unreachable)

After streaming refactor, both become hot paths. The `v8 ignore` annotations should be
removed in Block 2.

---

## §4 Design Strategy

### §4.1 Streaming TAR parser — AsyncGenerator coroutine

**ParseEvent discriminated union:**
```typescript
type ParseEvent =
  | { kind: 'entry'; entry: TarEntry }
  | { kind: 'chunk'; data: Uint8Array }
  | { kind: 'end' }
```

**`parseTar(source, mode)` state machine phases:**

```
HEADER:
  Pull chunks from XZ source until state.buffer.length >= 512
  Call parseNextHeader(state)
  → need-more-data : fetch next XZ chunk, concat to state.buffer, retry
  → end-of-archive : emit { kind: 'end' }, return
  → pax-consumed   : loop
  → entry          : emit { kind: 'entry', entry }
                     transition to CONTENT (mode='extract', size>0)
                     or SKIP (mode='list', or size===0)

CONTENT (extract, size > 0):
  Yield { kind: 'chunk', data } for bytes of this entry as they arrive
  Split chunk at entry boundary: yield entry portion, keep remainder in state.buffer
  When bytesRemaining === 0: transition to PADDING

SKIP (list, or size === 0):
  Consume bytesToSkip bytes silently (no yield)
  Split-chunk logic mirrors CONTENT
  When bytesToSkip === 0: transition to PADDING (if size > 0) or HEADER

PADDING:
  Consume paddingRemaining bytes silently
  When paddingRemaining === 0: transition to HEADER
```

**`extract()` assembly:**
1. Pull `kind: 'entry'` → get header, apply strip/filter
2. Yield `TarEntryWithData` with `entry.data` = inner generator pulling `kind: 'chunk'`
3. Outer generator is suspended while consumer iterates `entry.data`
4. When consumer advances, outer generator internally drains remaining chunks (S-08 safety)
5. Pull next `kind: 'entry'` or `kind: 'end'`

### §4.2 Buffer management

Bounded carryover in `state.buffer`:
- HEADER phase: max 511 bytes (waiting for one 512-byte block)
- PAX phase: max `paxSize + paxPadding` (typically < 4 KB)
- CONTENT/SKIP/PADDING: max `chunk.length` of one XZ output chunk

The `Buffer.concat([headerBlock, state.buffer])` re-entrancy in `consumePaxHeader()` (line
151) is the only retained concat. It is bounded by PAX payload size, not archive size.

### §4.3 Backpressure

Pipeline: `[XZ input] → createUnxz() Transform → AsyncGenerator.next() pulls`

`parseTar` uses `for await (const chunk of xzAsyncIterable)`. The generator only
`await`s the next XZ chunk when it needs more bytes. This only happens when the consumer
calls `.next()` on the outer `extract()` generator. Natural demand-driven flow — no
explicit pause/resume or highWaterMark manipulation.

### §4.4 `list()` vs `extract()` — shared core, distinct strategies

Both use `parseTar()`. In `list` mode, the generator transitions directly to SKIP after
each entry header without yielding `kind: 'chunk'` events. `list()` collects only
`kind: 'entry'` events and yields them as `TarEntry`. Memory bounded at O(BLOCK_SIZE).

XZ multi-block skip optimization (jumping past content at XZ block boundaries) is deferred
to §8 (requires encoder-side multi-block support).

---

## §5 BDD Scenarios

### S-01 — Small archive, single file
```
Given: .tar.xz with one 1 KB file "hello.txt"
When:  extract(input) is iterated
Then:  one TarEntryWithData yielded, entry.name === 'hello.txt'
And:   await entry.bytes() returns correct 1 KB content
And:   peak heapUsed delta < 10 MB
```

### S-02 — Large single entry (memory shape proof)
```
Given: .tar.xz with one 200 MB file "big.bin"
When:  extract(input) is iterated, entry.data drained chunk-by-chunk
Then:  peak heapUsed delta < 50 MB
And:   total bytes from entry.data === 200 * 1024 * 1024
```

### S-03 — Multi-entry archive, ordered
```
Given: archive [a.txt (10 KB), b.txt (5 MB), c.txt (3 KB)]
When:  extract(input) iterated
Then:  entries arrive in creation order, content correct
And:   peak heap never exceeds 5 MB + buffer overhead
```

### S-04 — PAX extended name (> 100 chars)
```
Given: archive with file whose name is 260 chars
When:  extract(input) iterated
Then:  entry.name === full 260-char name (PAX path applied)
And:   content correct
```

### S-05 — PAX header split across XZ chunks
```
Given: XZ stream mocked to emit 513-byte chunks
And:   PAX header payload starts at byte 512 (split)
When:  extract(input) iterated
Then:  entry.name correctly parsed, content correct
```

### S-06 — Zero-size entries (directory, empty file)
```
Given: archive with DIRECTORY entry and empty regular FILE
When:  extract(input) iterated
Then:  directory: type DIRECTORY, size 0, bytes() returns Uint8Array(0)
And:   empty file: type FILE, size 0, bytes() returns Uint8Array(0)
```

### S-07 — Consumer backpressure (slow drain)
```
Given: archive with 3 × 10 MB files
And:   consumer delays 50ms between each entry.data chunk
When:  extract(input) iterated
Then:  all entries yielded correctly, no data corruption
```

### S-08 — Consumer skips entry.data (does not drain)
```
Given: archive [a.txt (100 KB), b.txt (5 MB), c.txt (200 B)]
And:   consumer reads entry.name but never iterates entry.data for a.txt
When:  consumer advances to second entry
Then:  b.txt is correctly yielded with correct content
And:   a.txt bytes are not corrupted into b.txt
```

### S-09 — Malformed archive (truncated)
```
Given: .tar.xz truncated mid-entry
When:  extract(input) iterated
Then:  Error thrown containing "Unexpected end of archive"
And:   error propagates from for-await-of loop
```

### S-10 — Symlink entry TOCTOU (security regression)
```
Given: archive with SYMLINK entry pointing to "../escape"
When:  extractFile(archivePath, { cwd }) called
Then:  ensureSafeTarget throws "Refusing to extract entry outside cwd"
And:   no filesystem modification occurs
```

### S-11 — Hardlink with symlink source (security regression)
```
Given: archive with symlink at 'link', then HARDLINK pointing to 'link' as source
When:  extractFile(archivePath, { cwd }) called
Then:  throws "Refusing hardlink: source ... is a symlink"
```

### S-12 — list() memory shape
```
Given: .tar.xz with 100 × 10 MB files (1 GB total)
When:  list(input) iterated
Then:  100 TarEntry objects yielded with correct metadata
And:   peak heapUsed delta < 20 MB
```

### S-13 — NUL byte in PAX name (security regression)
```
Given: archive with PAX 'path' attribute containing NUL byte
When:  extractFile(archivePath, { cwd }) called
Then:  ensureSafeName throws "Refusing entry: name contains NUL byte"
```

### S-14 — Windows extraction TOCTOU window (A-01)
```
Given: process.platform === 'win32' (or simulated via mock)
And:   archive with one 50 MB file "data.bin"
And:   a slow XZ source delivering one 64 KB chunk every 10 ms
When:  extractFile(archivePath, { cwd }) is iterated
Then:  ensureSafeTarget runs ONCE before any byte is written
And:   the wallclock window between ensureSafeTarget and final write is documented (≤ entry.size / chunk_throughput)
And:   the spec-level threat-model note reflects "Windows: by-path TOCTOU window scales with entry size" — explicitly out of scope, mitigation deferred to a future fd-based path
```

### S-15 — PAX bomb DoS (state.buffer unbounded growth, A-07/A-08)
```
Given: malicious archive with PAX_HEADER claiming size = 2 GB
When:  extract(input) iterated against this archive
Then:  parseTar throws "PAX header exceeds maximum size (1 MB)" within bounded time
And:   peak heapUsed delta < 5 MB (does not allocate the claimed 2 GB)
And:   state.buffer.length never exceeds MAX_PAX_HEADER_BYTES (1 MB)
```

---

## §6 Implementation Blocks

### Block 1 — Streaming XZ pipeline foundation

**Scope:** `packages/tar-xz/src/node/xz-helpers.ts`

**Change:** Add `streamXz(input: TarInputNode): AsyncIterable<Uint8Array>`. Converts any
`TarInputNode` to a decompressed chunk stream via `toAsyncIterable(input)` →
`createUnxz()` Transform → `Readable.from()` async iterable. No accumulation.

Deprecate `collectAllChunks`, `decompressXz`, `runWritable` (remove when no external refs).

**Tests** (`packages/tar-xz/test/node/xz-helpers.spec.ts`):
- `streamXz` decompresses a known XZ byte sequence, chunks arrive before full archive consumed
- Slow mock (one compressed block at a time) confirms no pre-buffering
- Corrupt XZ propagates as thrown error in `for await`

**Exit criteria:** `streamXz` exported, tested. heapUsed delta < 5 MB for 50 MB XZ stream.

**Dependencies:** None.

---

### Block 2 — Shared streaming TAR parser generator

**Scope:** `packages/tar-xz/src/node/tar-parser.ts` (new export)

**Change:** Add `async function* parseTar(source: AsyncIterable<Uint8Array>, mode: 'extract' | 'list'): AsyncGenerator<ParseEvent>`.

- Reuses `parseNextHeader(state)` and `HeaderParserState` without modification
- Implements HEADER / CONTENT / SKIP / PADDING phases per §4.1
- Removes `v8 ignore` annotations from lines 86–89 and 148–153 (now exercised)

**Tests** (`packages/tar-xz/test/node/tar-parser.spec.ts`, new file):
- 3-entry archive fed in 128-byte chunks (forces every split boundary)
- PAX header with payload split across two 513-byte chunks (S-05)
- Two consecutive empty blocks → `kind: 'end'`
- Truncated stream → thrown error before `kind: 'end'` (S-09)
- `mode: 'list'` never emits `kind: 'chunk'` (S-12 shape)

**Exit criteria:** S-03, S-04, S-05, S-06, S-08, S-09 pass against `parseTar` directly.
Peak allocation during 200 MB file < 2× chunk size of source.

**Dependencies:** Block 1 (for integration tests; unit tests use in-memory mock source).

---

### Block 3 — `extract()` rewrite

**Scope:** `packages/tar-xz/src/node/extract.ts`

**Change:** Replace `TarUnpack extends Writable` with lean async generator:
```typescript
export async function* extract(input: TarInputNode, options: ExtractOptions = {}) {
  const xzStream = streamXz(input);             // Block 1
  const parser = parseTar(xzStream, 'extract'); // Block 2
  // assemble TarEntryWithData from ParseEvents
  // drain residual entry.data before advancing (S-08 safety)
}
```

`makeTarEntryWithData` rewritten to accept a pull-callback (not pre-buffered `Buffer`).
`bytes()` and `text()` collect from live `entry.data` generator.

**Tests** (extend `packages/tar-xz/test/node/extract.spec.ts`):
- S-01, S-02 (memory shape), S-03, S-06, S-07, S-08
- All pre-existing extract tests continue to pass

**Exit criteria:** `pnpm test` in `packages/tar-xz` passes. S-02 peak heapUsed delta < 50 MB.

**Dependencies:** Blocks 1 and 2.

---

### Block 4 — `list()` rewrite

**Scope:** `packages/tar-xz/src/node/list.ts`

**Change:** Replace `TarList extends Writable` with lean async generator using
`parseTar(xzStream, 'list')`. Collect `kind: 'entry'` events, yield as `TarEntry`.

**Tests** (extend `packages/tar-xz/test/node/list.spec.ts`):
- S-12 (memory shape): 100 entries from 1 GB archive, peak < 20 MB
- All pre-existing list tests continue to pass

**Exit criteria:** `pnpm test` passes. S-12 memory shape passes.

**Dependencies:** Blocks 1 and 2.

---

### Block 5 — Security regression audit + memory shape CI gate

**Scope:** New files:
- `packages/tar-xz/test/node/security.spec.ts`
- `packages/tar-xz/test/node/memory-shape.spec.ts`

**Change:**
1. Consolidate all 18 TOCTOU security test scenarios (from PR #108) into `security.spec.ts`
   with explicit vector labels. Tests call `extractFile()` to exercise the full stack.

2. Add `memory-shape.spec.ts` with `--expose-gc` heap measurements:
   - Build synthetic archive via `create()`, extract with heap snapshots
   - `extract()`: peak delta < 2× largest entry size (generous for GC timing)
   - `list()`: peak delta < 5 MB regardless of archive size

3. Add `--expose-gc` to vitest pool config in `packages/tar-xz/vitest.config.ts`:
   ```typescript
   pool: 'forks',
   poolOptions: { forks: { execArgv: ['--expose-gc'] } }
   ```

4. Tag memory tests `@slow`; exclude from default `pnpm test`, run via `pnpm test:memory`.

**Security regression map:**

| Test label | Vector | `file.ts` function |
|-----------|--------|--------------------|
| V1/R6-1 | Leaf symlink check | `ensureSafeTarget` |
| F-001 | Traversal `rel === '..'` | `ensureSafeTarget` |
| F-002 | TOCTOU ancestor check | `hasSymlinkAncestor` |
| R4-2 | Hardlink strip logic | `extractFile` |
| R5-1 | Hardlink symlink source | `extractFile` |
| V6a/V6b | NUL/empty name | `ensureSafeName` |
| V12 | setuid mask | `extractFile` |
| S2 | Hardlink escape | `extractFile` |
| S3 | Symlink ancestor TOCTOU | `hasSymlinkAncestor` |
| V2/V3 | fd-based O_NOFOLLOW | `extractFile` |

**Additional scenarios from adversarial review:**
- S-14 (Windows TOCTOU window): document threat-model note, no automatic mitigation
- S-15 (PAX bomb DoS): assertion that `state.buffer` never exceeds `MAX_PAX_HEADER_BYTES`

**Exit criteria:** All 18 security tests pass. S-14 + S-15 pass. Memory shape tests pass
with both UPPER bound (streaming peak < threshold) AND LOWER bound (buffered baseline
exceeded same threshold — proves the test discriminates). Tests pass after every future
change to `extract.ts` / `list.ts` / `xz-helpers.ts` (act as regression lock).

**Test runner config:**
- Add `pnpm test:memory` script to `packages/tar-xz/package.json` invoking
  `vitest run --config vitest.memory.config.ts`
- New `vitest.memory.config.ts` adds `pool: 'forks'`, `poolOptions.forks.execArgv: ['--expose-gc']`,
  `include: ['test/**/*.memory.spec.ts']`
- Default `pnpm test` excludes `*.memory.spec.ts` to avoid CI flakiness on hot runners
- Memory specs feature-detect `--expose-gc` via `typeof global.gc === 'function'`; skip
  with `it.skipIf(typeof global.gc !== 'function')` rather than fail

**Dependencies:** Blocks 3 and 4.

---

## §7 Test Strategy

### Memory measurement pattern

```typescript
// vitest.config.ts: pool: 'forks', execArgv: ['--expose-gc']
const before = process.memoryUsage();
if (typeof global.gc === 'function') global.gc();
// ... run extract/list iteration ...
if (typeof global.gc === 'function') global.gc();
const after = process.memoryUsage();
const delta = (after.heapUsed + after.external) - (before.heapUsed + before.external);
expect(delta).toBeLessThan(THRESHOLD_BYTES);
// THRESHOLD_BYTES: document baseline from current O(archive) implementation in comment
```

Thresholds set at 2× expected streaming peak to tolerate GC timing variance on CI.

**Discrimination guard (per A-05/A-06):** Each memory-shape test MUST assert BOTH:
1. UPPER bound: `streaming_peak < THRESHOLD` (the property under test)
2. LOWER bound discrimination: a parallel run against the OLD buffered code path
   (kept on a tagged commit or as `xz-helpers.legacy.ts` until Block 5 is complete)
   exceeds the same THRESHOLD — proving the test is meaningful.

Without the lower-bound check, a regression that accidentally retains O(N) behavior at
1.5× chunk size (still < 2× threshold) would silently pass.

**Ratio assertions (preferred form):**
- `extract`: `peak / archive_size < 0.3` (allows GC overhead, parser state)
- `list`: `peak / archive_size < 0.05` (no content, only metadata)

**Feature-detect pattern (avoids CI false-fail per A-05):**
```typescript
const hasGc = typeof (globalThis as any).gc === 'function';
it.skipIf(!hasGc)('S-02 memory shape', async () => { /* ... */ });
```

### Security regression coverage

10 test groups, 18 individual vectors. Each test:
- Creates a temporary archive using `create()` with a crafted malicious entry
- Calls `extractFile()` against a temp directory
- Asserts the specific error message and absence of filesystem side effects
- Cleans up temp directory in `afterEach`

---

## §8 Out of Scope (TODO.md Candidates)

- `💡 [tar-xz] list() XZ-block skip via index for O(1) content skip per entry` — requires
  multi-block encoder and XZ index parsing
- `💡 [tar-xz] Browser extract/list true streaming via WASM incremental decode` — WASM
  constraints make this non-trivial
- `🔧 [tar-xz] GNU sparse file format support (type 'S' / extended headers)`
- `🔧 [tar-xz] create() O(file) memory for large files — resolveSource reads entirely`

---

## §9 Risks

### R-1 — TOCTOU regression (HIGH)

Touching code audited across 8 Copilot review rounds. Any change to `TarEntry` field
population or `entry.data` yielding could silently break a security invariant in `file.ts`.

**Mitigation:** Block 5 creates dedicated security regression tests before any other block
is implemented. Implementer must run full test suite after each block. `file.ts` is not
modified.

### R-2 — PAX/GNU edge case regression (HIGH)

Streaming will exercise `consumePaxHeader()` re-entrancy (currently unreachable under `v8
ignore`). Hidden bugs in PAX handling may surface only with small-chunk input.

**Mitigation:** S-05 is mandatory (PAX payload split across XZ chunks). Block 2 unit tests
feed 128-byte chunks. Consider 1-byte chunk fuzzing as stretch goal.

### R-3 — Consumer-skip-drain data corruption (MEDIUM)

If `parseTar` does not drain remaining content before parsing the next header when the
consumer skips `entry.data`, subsequent entries will receive corrupted bytes.

**Mitigation:** S-08 is mandatory. The `parseTar` generator must unconditionally drain
content bytes before HEADER phase regardless of consumer behavior.

### R-4 — Memory shape measurement flakiness (MEDIUM)

`process.memoryUsage().heapUsed` reflects GC state. Tight thresholds cause CI failures.

**Mitigation:** `--expose-gc` + explicit `global.gc()`. Thresholds at 2× expected peak.
Tag tests `@slow`, exclude from default run.

### R-5 — `entry.data` single-use invariant (LOW)

Streaming makes the single-use constraint observably breaking (second iteration yields
nothing vs. the same bytes). Not a regression — current implementation has same constraint.

**Mitigation:** Add TSDoc note: "Single-use — consume exactly once. `bytes()` and `text()`
internally consume `data`; do not iterate `data` after calling them." Also note that
`bytes()` memoization (D-3) means holding the entry reference holds the bytes; do not
collect `entry` objects across iterations if memory is a concern.

### R-6 — Small-archive throughput regression (MEDIUM, A-04)

For archives with many tiny entries (e.g., 10 000 × 100 B), the streaming model adds
~10 awaits per entry vs. one Buffer.concat in buffered mode. Estimated 2-5× slowdown
on this shape (≈100 ms overhead floor on a typical Node v20 host).

**Mitigation:** Add a benchmark fixture `bench/small-archive.bench.ts` with 10 000-entry
fixture. Compare buffered baseline (kept around as `xz-helpers.legacy.ts` until Block 5)
vs. new streaming path. If regression > 2×, reconsider D-1 (chunk pass-through) and
allow a small (4 KB) coalescing buffer. Document the trade-off explicitly in the
benchmark output.

### R-7 — PAX bomb / unbounded state.buffer growth (MEDIUM, A-07/A-08)

`Buffer.concat([state.buffer, chunk])` in HEADER phase plus
`Buffer.concat([headerBlock, state.buffer])` in `consumePaxHeader()` are both unbounded
in the current design. A malicious archive declaring PAX size = 2 GB with 64 KB chunks
yields O(N²) memory churn and unbounded heap growth before the parser can refuse.

**Mitigation:** Cap `MAX_PAX_HEADER_BYTES = 1 MB` (plenty for legitimate UTF-8 paths;
GNU tar uses < 64 KB in practice). In Block 2, before `Buffer.concat`, check
`if (state.buffer.length + chunk.length > MAX_PAX_HEADER_BYTES) throw`.
Covered by S-15.

---

## §10 Adversarial Findings Ledger

Reviewed 2026-04-28. Five perspectives applied: security auditor, flaky CI test owner,
performance engineer, API contract lawyer, release manager.

| ID | Sev | Perspective | Finding | Spec section to update |
|----|-----|-------------|---------|------------------------|
| A-01 | S | Security auditor | Windows fallback (`file.ts:312-313`) uses `pipeline(Readable.from(entry.data), createWriteStream(target))` — by-path, NOT fd-based. In streaming mode, the wallclock window between `ensureSafeTarget` and the LAST byte written is now arbitrarily long (one XZ chunk per `await`). Symlink swap by a co-tenant process during this window is now reachable. POSIX path is safe (O_NOFOLLOW + fd writes), Windows is not. | New BDD scenario S-14 + §9 R-1 amendment |
| A-02 | S | Security auditor | `parseTar`'s "auto-drain on consumer skip" (D-4) executes inside the outer generator's `finally` block. If the auto-drain itself throws (corrupt content for an entry the user broke past), D-2 says swallow. But if `parseTar` is in CONTENT phase and the next read encounters a phase-state bug (e.g. `bytesRemaining` not zeroed), the error swallowed here would be a STREAM CORRUPTION that affects the NEXT entry, not just the current one. Consumer-break must abort the whole iterator, not silently advance. | §4 design + new D-5 invariant |
| A-03 | S | API contract lawyer | Bumping `tar-xz` to **6.1.0 (minor)** is wrong per Hyrum's Law on at least 4 observable behaviors: (a) `entry.data` chunk count/size is now bounded by XZ output cadence (was: exactly 1 chunk == full file); (b) `entry.bytes()`/`text()` now memoize (callers relying on fresh-read-each-time get cached state); (c) consumer-break errors silenced (was: surfaced after Buffer.concat); (d) second iteration of `entry.data` yields nothing (was: same single chunk again, since the inner generator was a closed-over variable). v6.0.0 just shipped (2026-04-27) and explicitly advertises stream-first; users have NOT yet calcified expectations, so this is the LAST window to change without a major bump. Recommendation: ship as **6.1.0** is acceptable IF the README "stream-first" promise is treated as the contract being delivered (the buffered impl was a bug). Otherwise: **7.0.0 with breaking-changes section**. | §6 (changeset note) + §10 explicit decision |
| A-04 | M | Performance engineer | Small-archive case: 10 000 × 100 byte entries = ~5 MB archive. Buffered model: 1 `Buffer.concat` for whole archive. Streaming: ≥10 000 × {parseNextHeader call, AsyncGenerator yield, `entry.data` inner generator yield, `Buffer.concat([state.buffer, chunk])` on every chunk arrival in HEADER phase}. Each `await` round-trip in V8 is ~1-5 µs; 10 000 entries × ~10 awaits each = ~100 ms minimum overhead floor BEFORE any work. For tarballs of many tiny files (npm package layouts, node_modules dumps), this can be 2-5× slower than buffered. D-1 explicitly chose pass-through, but the math wasn't done for small archives. | New §7.x perf benchmark + R-6 in §9 |
| A-05 | M | Flaky CI test owner | Memory shape thresholds at "2× expected peak" (R-4 mitigation) are NOT tight enough to catch a regression where the streaming refactor accidentally retains O(N) (e.g., closure capturing a `chunks: Uint8Array[]` array somewhere). Example: a 200 MB archive test with 50 MB threshold (S-02) would PASS even if the new code peaks at 80 MB — but 80 MB is closer to buffered behavior than to streaming. Need a **tight upper bound** (e.g., 4× chunk size + largest-pax-attr) AND a **lower-bound check** that the old buffered implementation actually exceeded the threshold (proof the test discriminates). Also: `--expose-gc` may not be available in containerized vitest pools — needs explicit feature-detect + skip. | §7 measurement pattern hardening |
| A-06 | M | Flaky CI test owner | Threshold 2× also fails to catch the **regression direction we care most about**: streaming peak BIGGER than buffered. If buffered baseline is 250 MB peak for a 200 MB single-entry archive (overhead from Buffer.concat doubling), and streaming peak is 100 MB, the test asserts `< 50 MB` and FAILS even though streaming WON. Need to either (a) baseline both implementations on the same fixture with a checked-in numeric snapshot, or (b) assert ratio: `peak / archive_size < 0.3` for `extract`, `< 0.05` for `list`. | §7 measurement pattern + new test scenario |
| A-07 | M | Performance engineer | `Buffer.concat([state.buffer, chunk])` (§4.2) executed once per XZ chunk arrival is O(state.buffer.length + chunk.length) — quadratic in worst case if state.buffer keeps growing because the parser can't make progress (e.g., very long PAX header). Bounded "by PAX payload size, not archive size" is correct in theory but not in pathological PAX-bomb input. Need an upper bound on `state.buffer.length` enforced in the parser (e.g., max 1 MB) with a thrown error otherwise, otherwise this is a DoS vector via crafted archives. | §9 R-7 + new BDD scenario S-15 |
| A-08 | M | Security auditor | `consumePaxHeader` re-entrancy (line 151) does `Buffer.concat([headerBlock, state.buffer])` to put the header back. If state.buffer is currently very large (e.g., XZ delivered a 64 KB chunk that contains the start of a giant PAX block), this concat is O(64 KB) per retry. Combined with A-07: a malicious archive with PAX size = 2 GB and 64 KB chunks would do ~32 768 retries each at O(state.buffer). This is reachable from `extract()` of an attacker-controlled archive. | §9 R-7 + bounded PAX size cap |
| A-09 | L | Security auditor | Spec §3.4 says "v8 ignore" annotations on lines 86-89 and 148-153 should be REMOVED in Block 2. Verified via `mcp__astix__get_symbol`: the annotations exist exactly there, and they correspond to the streaming paths. Fine, but the spec must also note: removing them means v8 coverage will report new uncovered lines until S-05 lands. Block sequencing must therefore land Block 2 tests BEFORE removing the annotations, or coverage gate fails CI. | §6 Block 2 exit criteria |
| A-10 | L | Performance engineer | `for await (const chunk of xzAsyncIterable)` (§4.3) creates a microtask per chunk. For a 10 GB decompressed stream at 64 KB/chunk = ~160 000 awaits. Each `await` schedules a microtask; on Node 20+ this is fine but adds ~5-10ms total overhead. Negligible for large archives, but worth a note. Also: `Readable.from(transform)` wraps a Transform in another Readable — verify it doesn't add buffering that defeats streaming. | §4.3 implementation note |
| A-11 | L | API contract lawyer | `entry.bytes()` memoization (D-3) creates a subtle leak: holding a reference to `entry` after the iterator advances now also holds the cached buffer FOREVER (until entry is GC'd). Currently same as buffered (cache is the same `u8` from the buffered impl). But: if a consumer collects all `entry` objects in an array (anti-pattern but legal), peak memory now scales with `sum(file_sizes)` if they call bytes() on each. Worth a doc note. | §9 R-5 amendment |
| A-12 | L | Release manager | Existing tests are in `packages/tar-xz/test/*.spec.ts` (flat: `coverage.spec.ts`, `node-api.spec.ts`, `tar-format.spec.ts`). Spec writes new tests under `packages/tar-xz/test/node/*.spec.ts` (subdir). Inconsistent with the established convention. Either move existing tests into `test/node/` first or write new tests at the same level. Vitest config `include: ['test/**/*.spec.ts']` covers both, but mixed layout signals confusion. | §6 Block paths or §7 test layout note |
| A-13 | L | Flaky CI test owner | Spec mentions `pnpm test:memory` (Block 5) but the `tar-xz/package.json` `scripts` block has no such script. Adding `--expose-gc` via `execArgv` in vitest forks pool is correct, but the runner script itself needs to filter by tag. Vitest's `@slow`-tag filtering requires `--reporter=...` config or `test.skip` conditional via env var. Spec should specify the exact env var name and vitest filter syntax. | §6 Block 5 + new sub-task |

**Findings count:** 3 S (must fix in spec) / 6 M (should fix) / 4 L (note)

### §10.1 MUST-FIX direct amendments applied below

- §6 Block 5: scope expanded to include S-14 (Windows TOCTOU window) + S-15 (PAX bomb DoS).
- §9: added R-6 (small-archive perf regression) and R-7 (PAX/state.buffer DoS via unbounded growth).
- §12: added D-5 (consumer-break must abort iterator on parseTar internal error, not silently advance).
- §11 placeholder retained for `/llm --spec` pass.

---

## §11 /llm --spec Consensus

Reviewed 2026-04-28. LLMs queried: codex (2 S + 3 M), gemini (errored — quota/network),
copilot (6 substantive points). Agreement axis: HIGH on architectural soundness; LOW on
spec implementation details (TarFormatError, memory-measurement strategy, test layout).

| ID | Sev | Source | Finding | Resolution |
|----|-----|--------|---------|------------|
| L-S-01 | S | Codex | §7 memory measurement uses before/after sampling — misses transient peaks. A spike during processing can be GC'd before the final snapshot, the test passes despite a real regression. | §7 + §12.3 amended: in-loop high-water mark sampling pattern |
| L-S-02 | S | Codex+Copilot | `TarFormatError` referenced in D-5 does NOT exist in repo (current code throws plain `Error`). Spec was unimplementable as written. | D-5 reworked to use Node-convention `err.code = 'TAR_PARSER_INVARIANT'` idiom (no new class, satisfies A-02) |
| L-M-03 | M | Codex | PAX_GLOBAL split (tar-parser.ts:169-174) has its own `v8 ignore` block. Spec §3.4 only mentions PAX (148-153). | §3.4 + §6 Block 2 amended to cover both PAX and PAX_GLOBAL split scenarios |
| L-M-04 | M | Codex | `peak / archive_size` ratio assertion ambiguous — `.tar.xz` has compressed size, decompressed tar size, and largest entry size that produce radically different thresholds. | §7 + §12.3 amended: denominator locked as `largestEntrySize` for `extract`; `decompressedTotalSize` for `list` |
| L-M-05 | M | Codex | `.next()` after undrained `entry.data` (auto-drain to next header) vs outer-iterator `.return()` (consumer break) still conflated in §2.3, §4.1, D-2, D-5. | §12.5 amended: explicit semantics + S-08 (auto-drain) vs S-08b (outer-break) test split |
| L-M-06 | M | Copilot | streamXz design: `Readable.from(transform)` adds another layer that obscures the "no extra buffering" claim. Prefer iterating `createUnxz()` Transform directly via `Symbol.asyncIterator`. | §6 Block 1 amended with implementation note |
| L-L-07 | L | Copilot | Semver framing: README v6.0.0 says "true streaming is a planned optimization" (not "shipped contract"). 6.1.0 still defensible but reframe as "shipping the planned optimization", not "fixing a buffered bug". | §12.1 reworded |
| L-L-08 | L | Copilot | Test layout: existing tests are flat (`packages/tar-xz/test/*.spec.ts`), not under `test/node/`. Security coverage already lives in `coverage.spec.ts`. Block 5 should consolidate, not invent a new layout. | §6 Block 5 amended: target `test/security.spec.ts` + `test/memory-shape.spec.ts` (flat) |
| L-L-09 | L | Copilot | `file.ts` security TSDoc + README currently document concurrent races as broadly out-of-scope. New POSIX-vs-Windows split must be reflected there in the same PR. | §12.2 already mandates it; §6 Block 5 amended to include doc updates as part of the PR |

**Findings count:** 2 S (must fix in spec) / 4 M (folded into spec amendments) / 3 L (folded as wording/scope refinements).

**Verdict:** SPEC-READY-FOR-USER-VALIDATION (Stage 2.5). All findings folded into spec
sections directly; no remaining open questions for the user beyond final approval.

Note: gemini errored on its consensus call — output was an unparseable error object. Codex
+ Copilot agreement was sufficient for consensus per `CONSENSUS_MIN_RESPONSES=2`. If
desired, `/llm --llm gemini` can be re-tried after gemini quota resets.

---

## §12 Locked Design Decisions (2026-04-28)

User-validated decisions BEFORE adversarial review (each via separate AskUserQuestion with
concrete chiffrage):

### D-1 — Chunk pass-through (no coalescing)

XZ decompressor output passes through to `parseTar` directly. No minimum-chunk buffering.

**Rationale:** XZ's default 64 KB output buffer rarely emits sub-4 KB chunks except at
end-of-stream. V8 generator yield overhead is sub-millisecond. Coalescing adds complexity
(~10-20 LOC + a 4 KB scratch buffer) for a < 1% perf gain on realistic archives. Simpler
code wins.

### D-2 — Hybrid error propagation (silent on consumer-break, throw during iter)

- During normal `for await (...)` iteration: errors propagate as thrown exceptions —
  unchanged from current behavior.
- On consumer-initiated break (generator `.return()`): drain stops immediately, no error
  surfaces from data the consumer explicitly chose not to read.

**Rationale:** Matches `tar-stream`, `it-tar`, and the JS AsyncGenerator native default.
Surfacing errors from skipped data via `finally`-throw produces unhandled promise
rejections which are hostile UX.

### D-3 — Cache helpers, single-use `data`

- `entry.data` is single-use: second iterate yields nothing (JS AsyncGenerator default).
- `entry.bytes()` and `entry.text()` memoize the result on first call. Subsequent calls
  return the cached buffer instantly.

**Rationale:** Real use cases benefit from idempotent helpers (inspect-then-decide,
validation tooling, multi-format probe, test sanity assertions). Memory promise preserved:
at most one entry's content is held in memory at a time (the current entry being inspected
— which is also held by user code that just retrieved it). Zero cost when never called.
Implementation: ~5 LOC of cache logic on the helper closures.

### D-4 — Implementation invariants derived from D-1/D-2/D-3

- `parseTar` generator: pass through XZ chunks unmodified except for entry-boundary splits
  (per §4.1).
- `extract()` outer generator: in its `finally` block, drain remaining content of the
  current entry but DO NOT re-throw any decode error caught during that drain. Re-throw
  only errors caught during forward iteration.
- `makeTarEntryWithData()`: capture an internal `cachedBytes: Uint8Array | null` field
  shared between `bytes()` and `text()`. `bytes()` populates it on first call. `text()`
  defers to `bytes()` then `TextDecoder`s the cached buffer.

### D-5 — Consumer-break drain failure semantics (added 2026-04-28, A-02)

D-2 says "on consumer-initiated break, drain stops immediately, no error surfaces from
data the consumer chose not to read." This is correct for the case where the drain
SUCCEEDS up to the next entry boundary. But if the auto-drain itself encounters a
PARSER STATE INVARIANT VIOLATION (not just "decompression error" — e.g.,
`bytesRemaining` desync, `state.buffer` corruption from an earlier malformed entry),
swallowing this error silently advances the iterator into a corrupted state for the
NEXT entry that the user DOES choose to read.

Rule: classify drain failures into two buckets.
- **Decode/IO error during skipped data** (XZ checksum fail, source errored mid-stream):
  swallow per D-2.
- **Parser invariant violation** (assertion on `state.buffer` shape, type bounds, etc.):
  ALWAYS re-throw, even on consumer break — the iterator is poisoned and must abort.

**Implementation (revised after /llm-spec L-S-02):** throw plain `Error` with a stable
`code` string property — Node convention idiom (`err.code === 'ENOENT'` etc.). No new
public class; no message-prefix matching (which is fragile and was Codex's specific
objection):

```typescript
const err = new Error(`parser invariant violated: ${details}`);
(err as Error & { code: string }).code = 'TAR_PARSER_INVARIANT';
throw err;
```

The outer generator's `finally` drain swallows errors per D-2 EXCEPT when
`(caught as { code?: unknown }).code === 'TAR_PARSER_INVARIANT'` — that always re-throws.

**Why `err.code` and not a new class:** matches A-02 user decision (no new public type).
Node-standard discrimination idiom — users who do care can `err.code === 'TAR_PARSER_INVARIANT'`
without an `instanceof` check that would require importing a new symbol. Initial spec said
"reuse existing TarFormatError" but `/llm-spec` Codex+Copilot both flagged that
`TarFormatError` does not exist in the repo (current code throws plain `Error`). Locking
the `err.code` pattern resolves this cleanly without expanding the public API.

### §12.1 Semver decision (locked 2026-04-28, A-03)

`tar-xz` will ship this refactor as **6.1.0 (minor bump)**. Justification: README v6.0.0
(2026-04-27) explicitly advertises "stream-first" as the headline contract. The buffered
implementation behind extract/list was always a bug — it shipped because tests didn't
exercise memory shape, not because anyone designed it. This refactor delivers the
contract that v6.0.0 promised. The behavior changes (chunk count, memoization,
single-use, consumer-break silence) are all consistent with that promised contract.

**Required in changeset:** explicit "Behavior changes (non-breaking but observable)"
section listing the four Hyrum's-Law items so users who built workarounds can update.
Do NOT bury this. If a downstream raises a complaint citing reasonable reliance on the
old behavior, we will issue 7.0.0 with a deprecation cycle. Probability: low (v6 is
six days old at the time of this spec).

User-validated 2026-04-28 during /adversarial → A-03 = 6.1.0 minor.

**Reframing (post-/llm-spec L-L-07):** Copilot correctly noted the README v6.0.0 actually
says "true streaming is a planned optimization" (not "shipped behavior"). The 6.1.0
justification stays sound but the framing is "shipping a planned optimization with
observable behavior changes that must be called out clearly", NOT "fixing a buffered bug".
Changeset wording must reflect this honest framing.

### §12.2 Windows TOCTOU policy (locked 2026-04-28, A-01)

POSIX path is fd-based with `O_NOFOLLOW`, so the symlink-swap window is bounded to
between `ensureSafeTarget` and `openat`. Even with streaming, the fd is held during the
whole content write — TOCTOU is closed.

Windows fallback (`file.ts:312-313`) uses `pipeline(Readable.from(entry.data),
createWriteStream(target))` — by-path operations. The streaming refactor extends the
wallclock window between `ensureSafeTarget` and the LAST byte written from "duration of
one Buffer.concat" (~ms) to "duration of all chunks for the entry" (~seconds-to-minutes
on big files). A co-tenant process can swap a symlink during this window.

**Decision:** PR #113 ships POSIX-secure as designed. Windows ships as today (TOCTOU
window now visibly extended), with explicit documentation:

- TSDoc on `extractFile` carries a `@security` warning describing the Windows TOCTOU
  window and recommending extraction to a directory not writable by other processes.
- README adds a "Security model" subsection in the Node section enumerating both paths.

**Follow-up:** new MEDIUM TODO in `node-liblzma/TODO.md` —
`[Win32] handle-based extraction (CreateFileW + FILE_FLAG_OPEN_REPARSE_POINT) for tar-xz Node extractFile to close TOCTOU on Windows`.
Estimate ~1-2h. Match the historical node-tar approach (which also defers Win32 hardening).

User-validated 2026-04-28 during /adversarial → A-01 = B (defer to TODO).

### §12.3 Memory measurement strategy (locked 2026-04-28, L-S-01 + L-M-04)

Codex flagged that before/after `process.memoryUsage()` snapshots miss transient peaks —
a real O(N) spike during processing can be GC'd before the final snapshot, masking a
regression. Spec §7 amended to use **in-loop high-water mark sampling**:

```typescript
let peak = 0;
const sample = () => {
  const m = process.memoryUsage();
  peak = Math.max(peak, m.heapUsed + m.external);
};

// Sample on EVERY chunk boundary inside the iteration loop
for await (const entry of extract(input)) {
  sample();
  for await (const chunk of entry.data) {
    sample();
    consumer(chunk);
  }
  sample();
}

expect(peak - baseline).toBeLessThan(THRESHOLD);
```

**Denominator policy** (L-M-04): ratio thresholds use a fixed denominator per test.
- For `extract` memory tests: denominator = `largestEntrySize` (the single biggest file
  inside the archive). Assertion: `peak ≤ 2 × largestEntrySize + 4 MB` (slack for
  parser carry-over and PAX cap).
- For `list` memory tests: denominator = `decompressedTotalSize` (full tar size after
  XZ). Assertion: `peak ≤ 2 MB` regardless of denominator (list never holds entry data).
- Compressed input size is NEVER used as a denominator (XZ ratio variance would make
  thresholds unstable).

`--expose-gc` feature-detect: if `typeof globalThis.gc !== 'function'` at test setup,
SKIP memory tests with a console-warn explaining why. CI must include `--expose-gc` in
the vitest fork pool config (Block 5).

### §12.4 Auto-drain vs consumer-break semantics (locked 2026-04-28, L-M-05)

Codex flagged that §2.3, §4.1, D-2, D-5 all blur two distinct cases. Spec amended to
make them explicit:

**Case A — `.next()` after undrained `entry.data`:**
Consumer iterates outer loop, inspects `entry.name`, never iterates `entry.data`,
proceeds to next entry. The outer generator must auto-drain remaining content of the
skipped entry BEFORE pulling the next header. Errors during this drain:
- Decode/IO error: SWALLOW per D-2 (consumer chose not to read; surfacing errors from
  skipped data is noise).
- `err.code === 'TAR_PARSER_INVARIANT'`: ALWAYS RE-THROW per D-5.

This auto-drain is REQUIRED for correctness — otherwise the next header would be parsed
from misaligned bytes (data corruption). Test: S-08.

**Case B — outer-iterator `.return()` (consumer-break):**
Consumer does `for await (const e of extract(...)) { if (...) break; }`. The runtime
calls the generator's `return()` method. The outer generator's `finally` runs but does
NOT need to drain to the next header — iteration is OVER. Just close the underlying XZ
stream + release resources. Errors during cleanup:
- Decode/IO/cleanup error: SWALLOW per D-2 (consumer chose to abandon iteration).
- `err.code === 'TAR_PARSER_INVARIANT'`: still RE-THROW per D-5 (a parser invariant
  violation reveals a bug in our code, not in user data; abandon-then-throw is correct).

Test: S-08b (new — added to §5 alongside existing S-08).

### §12.5 Implementation pointers from /llm-spec (logged 2026-04-28)

Quick technical notes from L-M-06, L-L-08, L-L-09 — implementer should mirror these:

- **streamXz (Block 1):** prefer iterating `createUnxz()` Transform directly via
  `Symbol.asyncIterator` on the Readable interface (Node Transform implements it).
  Avoid wrapping with `Readable.from(transform)` which adds another buffering layer
  and obscures the no-extra-buffer claim.

- **Test layout (Block 5):** use the existing flat layout
  (`packages/tar-xz/test/*.spec.ts`). Create `test/security.spec.ts` and
  `test/memory-shape.spec.ts` at the SAME level as `coverage.spec.ts`,
  `node-api.spec.ts`, `tar-format.spec.ts`. Migrate / consolidate existing security
  scenarios from `coverage.spec.ts` into `security.spec.ts` rather than duplicating.

- **`file.ts` documentation update (Block 5 scope):** the existing comments in
  `packages/tar-xz/src/node/file.ts` documenting "concurrent races out of scope" must
  be updated in this PR to reflect the new POSIX-secure / Windows-extended-window
  split (per §12.2). Implementer touches these comments only — no logic changes to
  `file.ts`.
