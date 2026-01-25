---
doc-meta:
  status: canonical
  scope: cli
  type: specification
  created: 2026-01-25
  updated: 2026-01-25
  complexity: COMPLEX
  time-budget: 90min
---

# Specification: nxz CLI Tool

## 0. Quick Reference (ALWAYS VISIBLE)

| Item | Value |
|------|-------|
| Scope | cli |
| Complexity | COMPLEX |
| Time budget | 90 min |
| Blocks | 5 |
| BDD scenarios | 15 |
| Risk level | LOW |

## 1. Problem Statement

Users need a portable, cross-platform CLI tool to compress and decompress files using XZ/LZMA2 format without requiring native xz installation. The tool should be familiar to xz users while showcasing all node-liblzma capabilities (streams, progress, parseFileIndex).

## 2. User Stories

### US-01: Basic Compression
```
AS A developer
I WANT to compress files using `nxz file.txt`
SO THAT I can reduce file sizes for storage or transfer

ACCEPTANCE: File compressed to file.txt.xz, original deleted by default
```

### US-02: Decompression
```
AS A developer
I WANT to decompress files using `nxz -d file.txt.xz`
SO THAT I can restore compressed files

ACCEPTANCE: File decompressed to file.txt, .xz file deleted by default
```

### US-03: File Information
```
AS A developer
I WANT to list XZ file info using `nxz -l file.xz`
SO THAT I can see compression ratio and metadata without decompressing

ACCEPTANCE: Shows uncompressed size, compressed size, ratio, check type
```

## 3. Business Rules

### 3.1 Invariants (always true)
- INV-01: Input file is never modified in place (use temp file + rename)
- INV-02: On error, partial output files are cleaned up
- INV-03: Exit codes match xz conventions (0=success, 1=error)

### 3.2 Preconditions (required before action)
- PRE-01: Input file must exist and be readable
- PRE-02: Output directory must be writable
- PRE-03: For decompress without -c: output path must not exist OR -f flag set

### 3.3 Effects (what changes)
- EFF-01: Compress: creates `.xz` file, deletes original (unless -k)
- EFF-02: Decompress: creates original file, deletes `.xz` (unless -k)
- EFF-03: List (-l): no file changes, outputs to stdout

### 3.4 Error Handling
- ERR-01: File not found → exit 1, message to stderr
- ERR-02: Permission denied → exit 1, message to stderr
- ERR-03: Output exists (no -f) → exit 1, message to stderr
- ERR-04: Invalid XZ format → exit 1, message to stderr
- ERR-05: SIGINT received → cleanup partial files, exit 130

## 4. Technical Design

### 4.1 Architecture Decision

**Pattern:** Single-file CLI with modular functions

**Rationale:**
- Simple to maintain
- No build step for CLI (TypeScript compiled)
- Uses existing node-liblzma APIs

**Structure:**
```
src/cli/
├── nxz.ts          # Main entry point + arg parsing
├── commands/
│   ├── compress.ts # Compression logic
│   ├── decompress.ts # Decompression logic
│   └── list.ts     # File info logic
└── utils/
    ├── progress.ts # Progress display
    └── cleanup.ts  # Signal handling + cleanup
```

### 4.2 Data Model Changes

None - CLI only uses existing APIs.

### 4.3 CLI Contract

| Flag | Long | Description |
|------|------|-------------|
| `-z` | `--compress` | Force compression (default) |
| `-d` | `--decompress` | Force decompression |
| `-l` | `--list` | List file info |
| `-k` | `--keep` | Keep original file |
| `-f` | `--force` | Overwrite existing output |
| `-c` | `--stdout` | Write to stdout |
| `-v` | `--verbose` | Verbose output (progress) |
| `-q` | `--quiet` | Suppress warnings |
| `-0` to `-9` | | Compression preset (default: 6) |
| `-e` | `--extreme` | Extreme compression mode |
| `-h` | `--help` | Show help |
| `-V` | `--version` | Show version |

**Positional arguments:** One or more files (or `-` for stdin)

### 4.4 Auto-Detection Rules

1. **Mode detection:**
   - If input ends with `.xz` → decompress (unless -z)
   - Otherwise → compress (unless -d)

2. **Output naming:**
   - Compress: `input` → `input.xz`
   - Decompress: `input.xz` → `input`

3. **Stream vs Sync:**
   - File size > 1MB → use streams with progress
   - File size <= 1MB → use sync for speed

## 5. Acceptance Criteria (BDD)

### Scenario Group: Compression

```gherkin
@priority:high @type:nominal
Scenario: Compress a file with default settings
  Given a file "test.txt" with content "Hello World"
  When I run "nxz test.txt"
  Then "test.txt.xz" is created
  And "test.txt" is deleted
  And exit code is 0

@priority:high @type:nominal
Scenario: Compress with keep flag
  Given a file "test.txt" with content "Hello World"
  When I run "nxz -k test.txt"
  Then "test.txt.xz" is created
  And "test.txt" still exists
  And exit code is 0

@priority:medium @type:nominal
Scenario: Compress with custom preset
  Given a file "test.txt" with content "Hello World"
  When I run "nxz -9 test.txt"
  Then "test.txt.xz" is created with preset 9
  And exit code is 0

@priority:medium @type:nominal
Scenario: Compress to stdout
  Given a file "test.txt" with content "Hello World"
  When I run "nxz -c test.txt > out.xz"
  Then stdout contains XZ compressed data
  And "test.txt" still exists
  And exit code is 0
```

### Scenario Group: Decompression

```gherkin
@priority:high @type:nominal
Scenario: Decompress a file
  Given a file "test.txt.xz" containing compressed "Hello World"
  When I run "nxz -d test.txt.xz"
  Then "test.txt" is created with content "Hello World"
  And "test.txt.xz" is deleted
  And exit code is 0

@priority:high @type:nominal
Scenario: Auto-detect decompress from extension
  Given a file "test.txt.xz" containing compressed data
  When I run "nxz test.txt.xz"
  Then "test.txt" is created
  And exit code is 0

@priority:medium @type:edge
Scenario: Decompress to stdout
  Given a file "test.txt.xz" containing compressed "Hello World"
  When I run "nxz -dc test.txt.xz"
  Then stdout contains "Hello World"
  And "test.txt.xz" still exists
  And exit code is 0
```

### Scenario Group: List

```gherkin
@priority:high @type:nominal
Scenario: List file info
  Given a file "test.txt.xz" created from 1000 bytes of text
  When I run "nxz -l test.txt.xz"
  Then output shows uncompressed size 1000
  And output shows compressed size
  And output shows compression ratio
  And exit code is 0
```

### Scenario Group: Error Handling

```gherkin
@priority:high @type:error
Scenario: File not found
  When I run "nxz nonexistent.txt"
  Then stderr contains "No such file"
  And exit code is 1

@priority:high @type:error
Scenario: Output exists without force
  Given a file "test.txt" exists
  And a file "test.txt.xz" exists
  When I run "nxz test.txt"
  Then stderr contains "already exists"
  And exit code is 1
  And "test.txt.xz" is unchanged

@priority:high @type:error
Scenario: Invalid XZ file
  Given a file "fake.xz" with content "not xz data"
  When I run "nxz -d fake.xz"
  Then stderr contains "File format not recognized"
  And exit code is 1

@priority:medium @type:edge
Scenario: Force overwrite
  Given a file "test.txt" with content "new"
  And a file "test.txt.xz" exists
  When I run "nxz -f test.txt"
  Then "test.txt.xz" contains compressed "new"
  And exit code is 0
```

### Scenario Group: Stdin/Stdout

```gherkin
@priority:medium @type:nominal
Scenario: Compress from stdin
  When I run "echo 'hello' | nxz -c > out.xz"
  Then "out.xz" contains valid XZ data
  And exit code is 0

@priority:medium @type:nominal
Scenario: Decompress to stdout pipe
  Given a file "test.xz" containing compressed "hello"
  When I run "nxz -dc test.xz | cat"
  Then output is "hello"
  And exit code is 0
```

**Coverage matrix:**

| Scenario | Nominal | Edge | Error | Security |
|----------|---------|------|-------|----------|
| SC-01 Compress default | ✓ | | | |
| SC-02 Compress keep | ✓ | | | |
| SC-03 Compress preset | ✓ | | | |
| SC-04 Compress stdout | ✓ | | | |
| SC-05 Decompress | ✓ | | | |
| SC-06 Auto-detect | ✓ | | | |
| SC-07 Decompress stdout | | ✓ | | |
| SC-08 List info | ✓ | | | |
| SC-09 File not found | | | ✓ | |
| SC-10 Output exists | | | ✓ | |
| SC-11 Invalid XZ | | | ✓ | |
| SC-12 Force overwrite | | ✓ | | |
| SC-13 Stdin compress | ✓ | | | |
| SC-14 Stdout pipe | ✓ | | | |

## 6. Implementation Plan

### Block 1: CLI Scaffolding + Help/Version — 15 min

**Type:** Feature slice
**Dependencies:** None
**Files:**
- `src/cli/nxz.ts` — Main entry with arg parsing
- `package.json` — Add bin entry
- `tsconfig.json` — Ensure CLI is compiled

**Exit criteria:**
- [ ] `nxz --help` shows usage
- [ ] `nxz --version` shows version
- [ ] Binary is executable via `npx nxz`

### Block 2: Compress Command — 20 min

**Type:** Feature slice
**Dependencies:** Block 1
**Files:**
- `src/cli/commands/compress.ts` — Compression logic
- `src/cli/nxz.ts` — Wire compress command

**Exit criteria:**
- [ ] `nxz file.txt` creates `file.txt.xz`
- [ ] `-k` flag keeps original
- [ ] `-f` flag overwrites existing
- [ ] `-c` writes to stdout
- [ ] Presets 0-9 and -e work
- [ ] Progress shown with -v for large files

### Block 3: Decompress Command — 20 min

**Type:** Feature slice
**Dependencies:** Block 1
**Files:**
- `src/cli/commands/decompress.ts` — Decompression logic
- `src/cli/nxz.ts` — Wire decompress command

**Exit criteria:**
- [ ] `nxz -d file.xz` creates original file
- [ ] Auto-detect mode from .xz extension
- [ ] `-k` flag keeps .xz file
- [ ] `-c` writes to stdout
- [ ] Error on invalid XZ data

### Block 4: List Command + Stdin Support — 15 min

**Type:** Feature slice
**Dependencies:** Block 1
**Files:**
- `src/cli/commands/list.ts` — List file info
- `src/cli/nxz.ts` — Add stdin support

**Exit criteria:**
- [ ] `nxz -l file.xz` shows metadata
- [ ] Shows uncompressed/compressed size, ratio, check type
- [ ] `echo data | nxz -c` works from stdin

### Block 5: Tests + Polish — 20 min

**Type:** Tests + cleanup
**Dependencies:** Blocks 1-4
**Files:**
- `test/cli.test.ts` — CLI integration tests
- `src/cli/utils/cleanup.ts` — Signal handling

**Exit criteria:**
- [ ] All 14 BDD scenarios have passing tests
- [ ] SIGINT cleanup works
- [ ] All error cases tested
- [ ] TypeScript compiles without errors

## 7. Test Strategy

### Test pyramid:

| Level | Count | Focus |
|-------|-------|-------|
| Unit | 5 | Arg parsing, output naming |
| Integration | 14 | Full CLI scenarios |
| E2E | 0 | (CLI tests are inherently E2E) |

### Test data requirements:
- Fixtures: Small text file, pre-compressed .xz file
- Mocks: None (uses real compression)
- Temp directory: Each test creates isolated temp dir

### Test structure (AAA pattern):
```typescript
it('should compress file with default settings', async () => {
  // Arrange
  const tempDir = await mkdtemp(join(tmpdir(), 'nxz-'));
  const inputPath = join(tempDir, 'test.txt');
  await writeFile(inputPath, 'Hello World');

  // Act
  const result = await runCli(['test.txt'], { cwd: tempDir });

  // Assert
  expect(result.exitCode).toBe(0);
  expect(await exists(join(tempDir, 'test.txt.xz'))).toBe(true);
  expect(await exists(inputPath)).toBe(false);
});
```

## 8. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Stream errors not handled | M | L | Wrap in try/catch, cleanup on error |
| Windows path handling | M | M | Use path.join, test on Windows CI |
| Large file memory | L | L | Always use streams for >1MB |

## 9. Definition of Done

- [ ] All 5 blocks implemented
- [ ] All 14 BDD scenarios have passing tests
- [ ] All tests pass (unit + integration)
- [ ] Lint/typecheck pass
- [ ] Help text is complete and accurate
- [ ] README updated with CLI usage
- [ ] /review clean (no blocking findings)
