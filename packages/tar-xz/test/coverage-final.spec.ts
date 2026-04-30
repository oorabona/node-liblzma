/**
 * Final coverage push for tar-xz — PR-β
 *
 * Targets the remaining uncovered lines after PR-α:
 *  - create.ts:88-104  AsyncIterable<Uint8Array> source branch in resolveSource()
 *  - extract.ts:71-72  empty entry bytes() fast-path
 *  - file.ts:223       lstat ENOENT swallow for forward-reference hardlink
 *  - file.ts:232       symlink-as-hardlink-source rejection
 *  - tar-parser.ts:254 truncated mid-header → "Unexpected end of archive"
 *  - tar-parser.ts:338 truncated mid-entry SKIP phase → "Unexpected end of archive"
 *  - tar-parser.ts:361 truncated mid-padding → "Unexpected end of archive"
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { xzSync } from 'node-liblzma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create } from '../src/node/create.js';
import { extract, list } from '../src/node/index.js';
import { extractFile } from '../src/node/file.js';
import { calculatePadding, createEndOfArchive, createHeader } from '../src/tar/format.js';
import { TarEntryType } from '../src/types.js';

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

/** Compress a raw TAR Buffer to XZ and return an async iterable of the XZ bytes. */
async function* rawTarXzStream(buf: Buffer): AsyncIterable<Uint8Array> {
  const compressed = xzSync(buf);
  yield new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);
}

/** Build a minimal raw TAR buffer with entries followed by end-of-archive. */
function buildRawTar(
  entries: Array<{
    name: string;
    content: Buffer;
    type?: string;
    linkname?: string;
  }>
): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const type = entry.type ?? '0';
    const isLink =
      type === TarEntryType.SYMLINK ||
      type === TarEntryType.HARDLINK ||
      type === TarEntryType.DIRECTORY;
    const size = isLink ? 0 : entry.content.length;
    const header = createHeader({
      name: entry.name,
      size,
      type: type as '0',
      linkname: entry.linkname,
    });
    blocks.push(Buffer.from(header));
    if (size > 0) {
      blocks.push(entry.content);
      const pad = calculatePadding(size);
      if (pad > 0) blocks.push(Buffer.alloc(pad));
    }
  }
  blocks.push(Buffer.from(createEndOfArchive()));
  return Buffer.concat(blocks);
}

// ---------------------------------------------------------------------------
// Test 1 — create.ts:88-104  AsyncIterable<Uint8Array> source
// ---------------------------------------------------------------------------

describe('create() — AsyncIterable<Uint8Array> source (resolveSource branch)', () => {
  it('concatenates chunks from an AsyncIterable source into archive content', async () => {
    const part1 = new Uint8Array([0x01, 0x02, 0x03]);
    const part2 = new Uint8Array([0x04, 0x05]);
    const part3 = new Uint8Array([0x06]);

    async function* asyncSource(): AsyncIterable<Uint8Array> {
      yield part1;
      yield part2;
      yield part3;
    }

    const archive = create({
      files: [{ name: 'async-data.bin', source: asyncSource() }],
    });

    const entries: Array<{ name: string; content: Uint8Array }> = [];
    for await (const entry of extract(archive)) {
      entries.push({ name: entry.name, content: await entry.bytes() });
    }

    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('async-data.bin');
    // Content must be the exact concatenation of the three chunks
    const expected = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
    expect(entries[0]?.content).toEqual(expected);
  });

  it('handles an AsyncIterable source that yields a single chunk', async () => {
    const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

    async function* singleChunk(): AsyncIterable<Uint8Array> {
      yield data;
    }

    const archive = create({
      files: [{ name: 'single.bin', source: singleChunk() }],
    });

    const entries: Array<{ name: string; content: Uint8Array }> = [];
    for await (const entry of extract(archive)) {
      entries.push({ name: entry.name, content: await entry.bytes() });
    }

    expect(entries).toHaveLength(1);
    expect(entries[0]?.content).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — extract.ts:71-72  empty entry bytes() fast-path
// ---------------------------------------------------------------------------

describe('extract() — empty entry bytes() fast-path', () => {
  it('bytes() returns Uint8Array(0) for a zero-byte entry', async () => {
    const raw = buildRawTar([{ name: 'empty.txt', content: Buffer.alloc(0) }]);

    const entries: Array<{ name: string; content: Uint8Array }> = [];
    for await (const entry of extract(rawTarXzStream(raw))) {
      entries.push({ name: entry.name, content: await entry.bytes() });
    }

    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('empty.txt');
    expect(entries[0]?.content).toBeInstanceOf(Uint8Array);
    expect(entries[0]?.content.byteLength).toBe(0);
    expect(entries[0]?.content).toEqual(new Uint8Array(0));
  });

  it('bytes() called twice on zero-byte entry returns cached Uint8Array(0)', async () => {
    const raw = buildRawTar([{ name: 'empty2.txt', content: Buffer.alloc(0) }]);

    for await (const entry of extract(rawTarXzStream(raw))) {
      const first = await entry.bytes();
      const second = await entry.bytes();
      expect(first.byteLength).toBe(0);
      // Second call returns the cached instance
      expect(second).toBe(first);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 1b — create.ts:89  ArrayBuffer source branch in resolveSource()
// ---------------------------------------------------------------------------

describe('create() — ArrayBuffer source (resolveSource branch)', () => {
  it('accepts ArrayBuffer source and produces correct archive content', async () => {
    const raw = new Uint8Array([0x0a, 0x0b, 0x0c, 0x0d]).buffer; // ArrayBuffer

    const archive = create({
      files: [{ name: 'arraybuf.bin', source: raw }],
    });

    const entries: Array<{ name: string; content: Uint8Array }> = [];
    for await (const entry of extract(archive)) {
      entries.push({ name: entry.name, content: await entry.bytes() });
    }

    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('arraybuf.bin');
    expect(entries[0]?.content).toEqual(new Uint8Array([0x0a, 0x0b, 0x0c, 0x0d]));
  });
});

// ---------------------------------------------------------------------------
// Test 4 — file.ts:223  lstat ENOENT for forward-reference hardlink
// ---------------------------------------------------------------------------

describe('extractFile() — forward-reference hardlink (lstat ENOENT swallow)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-cov-final-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('swallows lstat ENOENT for forward-reference hardlink (link target not yet extracted)', async () => {
    const dest = path.join(tempDir, 'dest');

    // Build TAR where the hardlink entry comes BEFORE the referent file.
    // extractHardlinkEntry:
    //   1. lstat(linkSource) → ENOENT (target.txt not extracted yet) → swallowed (L223)
    //   2. link(linkSource, target) → ENOENT (source still doesn't exist) → propagates
    //
    // This test exercises the lstat ENOENT swallow at L223. The subsequent link()
    // ENOENT is the expected observable error — it is different from the lstat error.
    const content = Buffer.from('hardlink-target-content');

    const hardlinkHeader = createHeader({
      name: 'link.txt',
      size: 0,
      type: TarEntryType.HARDLINK,
      linkname: 'target.txt',
    });
    const targetHeader = createHeader({ name: 'target.txt', size: content.length, type: '0' });
    const pad = calculatePadding(content.length);

    const rawTar = Buffer.concat([
      Buffer.from(hardlinkHeader),
      Buffer.from(targetHeader),
      content,
      Buffer.alloc(pad > 0 ? pad : 0),
      Buffer.from(createEndOfArchive()),
    ]);

    const archivePath = path.join(tempDir, 'hardlink-forward.tar.xz');
    await fs.writeFile(archivePath, xzSync(rawTar));

    // link() throws ENOENT (source not yet on disk) — that error propagates.
    // The important thing is that lstat ENOENT was swallowed (not re-thrown).
    // If lstat ENOENT were re-thrown, we'd still get ENOENT, but from lstat syscall.
    // We verify: target.txt IS written (second entry), meaning the extractor
    // processed both entries before link() failed, OR the error is from link().
    let caughtError: Error | undefined;
    try {
      await extractFile(archivePath, { cwd: dest });
    } catch (e) {
      caughtError = e as Error;
    }

    // The extractor must have processed target.txt (second entry after hardlink)
    // — if lstat ENOENT propagated, extraction would have aborted before target.txt.
    // Since hardlink entry is first, we expect: lstat ENOENT swallowed, link() ENOENT thrown.
    // target.txt may or may not exist depending on whether extractFile aborts on first error.
    // What we CAN assert: if there IS an error, it is from link() (syscall='link'), not lstat.
    if (caughtError) {
      const errno = caughtError as NodeJS.ErrnoException;
      expect(errno.code).toBe('ENOENT');
      expect(errno.syscall).toBe('link');
    }
    // If no error: kernel allowed the forward hardlink (OS-dependent), extraction succeeded.
  });
});

// ---------------------------------------------------------------------------
// Test 4b — file.ts:232  hardlink source has symlink ancestor (POSIX only)
// ---------------------------------------------------------------------------

describe('extractFile() — hardlink rejected when source has symlink ancestor (R5-1 TOCTOU)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-cov-final-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('rejects hardlink when an ancestor directory of the source is a symlink (POSIX only)', async () => {
    if (process.platform === 'win32') return;

    const dest = path.join(tempDir, 'dest');
    await fs.mkdir(dest);

    // Create: dest/realdir/target.txt (real file)
    // Create: dest/symlinkdir → dest/realdir (symlink to directory)
    // TAR hardlink: link.txt → symlinkdir/target.txt
    //
    // When extractHardlinkEntry processes this:
    //   lstat(dest/symlinkdir/target.txt) → follows symlink → succeeds (regular file)
    //   isSymbolicLink() → false (it's a real file through the symlink)
    //   hasSymlinkAncestor(dest/symlinkdir/target.txt, dest) → true (symlinkdir IS a symlink)
    //   → throws "Refusing hardlink: source '...' has a symlink ancestor"
    const realDir = path.join(dest, 'realdir');
    await fs.mkdir(realDir);
    const realFile = path.join(realDir, 'target.txt');
    await fs.writeFile(realFile, 'target-content');

    // Create symlink: dest/symlinkdir → dest/realdir
    const symlinkDir = path.join(dest, 'symlinkdir');
    await fs.symlink(realDir, symlinkDir);

    // Build TAR: hardlink link.txt → symlinkdir/target.txt
    const hardlinkHeader = createHeader({
      name: 'link.txt',
      size: 0,
      type: TarEntryType.HARDLINK,
      linkname: 'symlinkdir/target.txt',
    });
    const rawTar = Buffer.concat([Buffer.from(hardlinkHeader), Buffer.from(createEndOfArchive())]);

    const archivePath = path.join(tempDir, 'ancestor-symlink.tar.xz');
    await fs.writeFile(archivePath, xzSync(rawTar));

    // Must throw: "Refusing hardlink: source '...' has a symlink ancestor (TOCTOU risk)"
    await expect(extractFile(archivePath, { cwd: dest })).rejects.toThrow(
      /Refusing hardlink.*symlink ancestor/i
    );
  });
});

// ---------------------------------------------------------------------------
// Test 5 — file.ts:232  symlink-as-hardlink-source rejection (POSIX only)
// ---------------------------------------------------------------------------

describe('extractFile() — hardlink to symlink source rejection (R5-1)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-cov-final-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('rejects hardlink when source is a pre-existing symlink (POSIX only)', async () => {
    if (process.platform === 'win32') return;

    const dest = path.join(tempDir, 'dest');
    await fs.mkdir(dest);

    // Pre-create a real file and a symlink to it inside dest.
    const realFile = path.join(dest, 'real.txt');
    await fs.writeFile(realFile, 'real-content');
    const symlinkPath = path.join(dest, 'symlink-source.txt');
    await fs.symlink(realFile, symlinkPath);

    // Build TAR with hardlink → symlink-source.txt (already present as a symlink).
    const hardlinkHeader = createHeader({
      name: 'hardlink.txt',
      size: 0,
      type: TarEntryType.HARDLINK,
      linkname: 'symlink-source.txt',
    });
    const rawTar = Buffer.concat([Buffer.from(hardlinkHeader), Buffer.from(createEndOfArchive())]);

    const archivePath = path.join(tempDir, 'symlink-hardlink.tar.xz');
    await fs.writeFile(archivePath, xzSync(rawTar));

    // Must throw: "Refusing hardlink: source '...' is a symlink (...)"
    await expect(extractFile(archivePath, { cwd: dest })).rejects.toThrow(
      /Refusing hardlink.*symlink/i
    );
  });
});

// ---------------------------------------------------------------------------
// Test 5b — file.ts:275  non-ELOOP open() error re-throw (POSIX only)
// ---------------------------------------------------------------------------

describe('extractFile() — open() error re-throw for non-ELOOP errors (POSIX only)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-cov-final-'));
  });

  afterEach(async () => {
    // Restore permissions before cleanup so rm -rf can succeed
    const dest = path.join(tempDir, 'dest');
    await fs.chmod(dest, 0o755).catch(() => {});
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('propagates EACCES when destination directory is not writable (POSIX only)', async () => {
    // Skip if running as root (root bypasses permissions)
    if (process.platform === 'win32' || process.getuid?.() === 0) return;

    const dest = path.join(tempDir, 'dest');
    await fs.mkdir(dest);

    // Build a valid archive
    const rawTar = buildRawTar([{ name: 'file.txt', content: Buffer.from('hello') }]);
    const archivePath = path.join(tempDir, 'noperm.tar.xz');
    await fs.writeFile(archivePath, xzSync(rawTar));

    // Make dest non-writable — open() will fail with EACCES (not ELOOP)
    await fs.chmod(dest, 0o555);

    // The EACCES error propagates from open() through the non-ELOOP throw path (L275)
    await expect(extractFile(archivePath, { cwd: dest })).rejects.toThrow(/EACCES/i);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — tar-parser.ts:254  truncated mid-header
// ---------------------------------------------------------------------------

describe('parseTar() — truncated mid-header throws "Unexpected end of archive"', () => {
  it('throws when archive ends mid-header (256 bytes — half a 512-byte block)', async () => {
    // parseTar enters HEADER phase, successfully gets 256 bytes from pullChunk(),
    // then parseNextHeader returns 'need-more-data', calls pullChunk() again
    // → done=true → throws "Unexpected end of archive".
    // The raw bytes must be XZ-compressed since list()/extract() decompresses first.
    const halfHeader = Buffer.alloc(256, 0x42); // non-zero → not an empty block
    const compressed = xzSync(halfHeader);

    async function* source(): AsyncIterable<Uint8Array> {
      yield new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);
    }

    await expect(async () => {
      for await (const _ of list(source())) {
        // consume
      }
    }).rejects.toThrow('Unexpected end of archive');
  });

  it('throws when archive ends after exactly 0 decompressed bytes', async () => {
    // Build a valid XZ stream that decompresses to 0 bytes (empty content).
    // parseTar pulls the first chunk → done=true → throws immediately.
    const emptyTar = Buffer.alloc(0);
    const compressed = xzSync(emptyTar);

    async function* source(): AsyncIterable<Uint8Array> {
      yield new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);
    }

    await expect(async () => {
      for await (const _ of list(source())) {
        // consume
      }
    }).rejects.toThrow('Unexpected end of archive');
  });
});

// ---------------------------------------------------------------------------
// Test 7 — tar-parser.ts:338  truncated mid-entry in SKIP phase
// ---------------------------------------------------------------------------

describe('parseTar() — truncated mid-entry in SKIP phase throws "Unexpected end of archive"', () => {
  it('throws when archive ends mid-body during list() SKIP phase', async () => {
    // list() mode: parseTar enters SKIP phase after emitting the entry event.
    // If the buffer runs out during SKIP before consuming all declared bytes,
    // it throws "Unexpected end of archive".
    //
    // Build: valid header declaring size=1024, but only provide 512 bytes of body.
    // XZ-compress the truncated TAR — list()/extract() decompresses before parsing.
    const declaredSize = 1024;
    const partialBody = Buffer.alloc(512, 0xab);

    const header = createHeader({ name: 'truncated.bin', size: declaredSize, type: '0' });
    // Provide only 512 bytes of body (half of 1024) — no EOA.
    const raw = Buffer.concat([Buffer.from(header), partialBody]);
    const compressed = xzSync(raw);

    async function* source(): AsyncIterable<Uint8Array> {
      yield new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);
    }

    // list() uses 'list' mode → SKIP phase needs all 1024 bytes but only 512 present
    await expect(async () => {
      for await (const _ of list(source())) {
        // consume entries — forces SKIP to run through all declared bytes
      }
    }).rejects.toThrow('Unexpected end of archive');
  });
});

// ---------------------------------------------------------------------------
// Test 8 — tar-parser.ts:361  truncated mid-padding
// ---------------------------------------------------------------------------

describe('parseTar() — truncated mid-padding throws "Unexpected end of archive"', () => {
  it('throws when archive ends mid-padding (PADDING phase in extract mode)', async () => {
    // In extract mode: after CONTENT phase comes PADDING phase.
    // An entry of size=300 requires 212 bytes of padding (512 - 300 = 212).
    // If the stream ends before all padding bytes are provided (and before EOA),
    // parseTar throws "Unexpected end of archive".
    // XZ-compress the truncated TAR — extract() decompresses before parsing.
    const size = 300;
    const body = Buffer.alloc(size, 0xcd);
    const paddingNeeded = calculatePadding(size);
    expect(paddingNeeded).toBe(212); // sanity-check the fixture

    // Provide only 100 bytes of padding (partial) — no EOA
    const partialPadding = Buffer.alloc(100, 0x00);
    const header = createHeader({ name: 'padded.bin', size, type: '0' });
    const raw = Buffer.concat([Buffer.from(header), body, partialPadding]);
    const compressed = xzSync(raw);

    async function* source(): AsyncIterable<Uint8Array> {
      yield new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);
    }

    // extract mode: parseTar yields CONTENT chunks then enters PADDING.
    // PADDING needs 212 bytes but only 100 are available → throws.
    await expect(async () => {
      for await (const entry of extract(source())) {
        // Consume entry data to advance parseTar through CONTENT into PADDING
        await entry.bytes();
      }
    }).rejects.toThrow('Unexpected end of archive');
  });
});
