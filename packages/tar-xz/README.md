# tar-xz

Universal tar.xz library — stream-first, Node and Browser, same API.

[![npm](https://img.shields.io/npm/v/tar-xz)](https://www.npmjs.com/package/tar-xz)
[![License: LGPL-3.0](https://img.shields.io/badge/License-LGPL--3.0-blue.svg)](https://www.gnu.org/licenses/lgpl-3.0)

Create and extract `.tar.xz` archives with streaming support for Node.js and
WebAssembly-powered support for browsers — using the same `create`/`extract`/`list`
function names in both environments.

## Features

- **Unified API** — `create`, `extract`, `list` work identically in Node.js and browsers
- **Stream-shaped API** — all functions return `AsyncIterable<…>`; stream-shaped inputs accepted. Node `extract()`/`list()` now stream chunks as XZ decompresses them — memory stays O(largest single entry). v6.0.0 introduced the stream-first API contract; v6.1.0 delivers the planned optimization that fulfills it.
- **Flexible input** — `extract()` and `list()` accept `AsyncIterable`, `Uint8Array`,
  `ArrayBuffer`, Web `ReadableStream`, or Node `ReadableStream`
- **Flexible source** — `create()` accepts fs paths (Node), `Buffer`/`Uint8Array`, or
  `AsyncIterable<Uint8Array>` per file
- **File helpers** — `tar-xz/file` subpath for disk I/O (Node only)
- **Full TAR support** — POSIX ustar with PAX extensions for long filenames and metadata
- **TypeScript** — full type definitions included
- **Zero runtime deps** — only requires `node-liblzma` (native in Node, WASM in browser)

## Installation

```bash
npm install tar-xz
pnpm add tar-xz
yarn add tar-xz
```

## Quick Start

Node.js and browser use the **same import**:

```typescript
import { create, extract, list } from 'tar-xz';
```

Bundlers (Vite, Webpack, esbuild) resolve to the WASM implementation in browser
builds automatically via the `browser` condition in `package.json`.

## API Usage

### Creating an archive

`create()` returns an `AsyncIterable<Uint8Array>`. Pipe it wherever you need:

```typescript
import { create } from 'tar-xz';

const enc = new TextEncoder();
const archiveStream = create({
  files: [
    { name: 'hello.txt', source: enc.encode('Hello, world!') },
    { name: 'data.json', source: enc.encode(JSON.stringify({ ok: true })) },
  ],
  preset: 6,                               // XZ compression level 0–9 (default: 6)
  filter: (file) => !file.name.endsWith('.tmp'),  // optional
});

// Collect to a Uint8Array (browser / in-memory use)
const chunks: Uint8Array[] = [];
for await (const chunk of archiveStream) {
  chunks.push(chunk);
}
const archive = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
let offset = 0;
for (const chunk of chunks) { archive.set(chunk, offset); offset += chunk.length; }

// Or pipe to a WritableStream (browser)
const writer = writable.getWriter();
for await (const chunk of create({ files: [...] })) {
  await writer.write(chunk);
}
await writer.close();
```

### Extracting an archive

`extract()` yields `TarEntryWithData` objects. Consume `entry.data` or use the
convenience helpers `entry.text()` and `entry.bytes()`:

```typescript
import { extract } from 'tar-xz';

for await (const entry of extract(archiveStream)) {
  if (entry.type === '0') {          // regular file — TarEntryType.FILE
    const content = await entry.text();
    console.log(entry.name, content);
  }
}

// Or collect raw bytes
for await (const entry of extract(archive)) {
  if (entry.type === '0') {
    const bytes = await entry.bytes();
    console.log(entry.name, bytes.byteLength, 'bytes');
  }
}
```

> **Important:** `entry.data` is a lazy `AsyncIterable` — consume or skip each entry
> before the `for await` loop advances to the next one. Calling `entry.bytes()` or
> iterating `entry.data` fully satisfies this requirement.

### Listing an archive

`list()` yields `TarEntry` metadata without reading file content:

```typescript
import { list } from 'tar-xz';

for await (const entry of list(archiveStream)) {
  console.log(entry.name, entry.size, entry.mtime);
}
```

### Inputs accepted by `extract()` and `list()`

All of the following are valid as the first argument:

```typescript
extract(asyncIterable)            // AsyncIterable<Uint8Array>
extract(syncIterable)             // Iterable<Uint8Array> (e.g. [chunk1, chunk2])
extract(uint8array)               // Uint8Array (in-memory archive)
extract(arrayBuffer)              // ArrayBuffer
extract(webReadableStream)        // ReadableStream<Uint8Array> (Web Streams)
extract(nodeReadableStream)       // NodeJS.ReadableStream (Node only)
```

### Source types per file in `create()`

```typescript
create({
  files: [
    { name: 'from-disk.txt', source: '/absolute/or/relative/path' }, // Node only
    { name: 'from-buffer.bin', source: Buffer.from([0x01, 0x02]) },
    { name: 'from-uint8.bin', source: new Uint8Array([0x03, 0x04]) },
    { name: 'from-stream.bin', source: asyncIterableOfChunks },
  ],
});
```

`string` sources (fs paths) throw a helpful error in browser environments — there
is no filesystem access in browsers.

## File Helpers (Node only)

`tar-xz/file` wraps the stream API with disk I/O convenience functions:

```typescript
import { createFile, extractFile, listFile } from 'tar-xz/file';

// Write archive to disk
await createFile('archive.tar.xz', {
  files: [
    { name: 'a.txt', source: '/path/to/a.txt' },
    { name: 'b.txt', source: Buffer.from('hello') },
  ],
});

// Extract archive from disk to a directory
await extractFile('archive.tar.xz', {
  cwd: './output',     // target directory (default: process.cwd())
  strip: 1,            // strip N leading path components (default: 0)
  filter: (entry) => entry.name.endsWith('.ts'),  // optional
});

// List archive on disk (returns TarEntry[])
const entries = await listFile('archive.tar.xz');
for (const entry of entries) {
  console.log(entry.name, entry.size);
}
```

Do not import `tar-xz/file` in browser bundles — it imports `node:fs` and will
fail at runtime. Use `create`/`extract`/`list` directly in browser code.

## Security model

`extractFile` enforces layered path-safety checks before writing any bytes to
disk: traversal detection (`..` and absolute paths), leaf-symlink rejection
(`O_NOFOLLOW` on POSIX), ancestor-symlink TOCTOU guard, hardlink validation,
NUL/empty name rejection, and setuid/setgid/sticky-bit stripping.

The TOCTOU mitigation differs by platform:

**POSIX (Linux, macOS):** FILE entries are written through a file descriptor
opened with `O_NOFOLLOW`. The fd is held open for the entire streaming write,
so the window between the safety check and the last write is effectively zero.

**Windows:** `O_NOFOLLOW` is not available. Extraction falls back to by-path
stream operations (`createWriteStream`). With streaming delivery (v6.1.0), the
window between the initial safety check and the last written byte scales with
the entry's size — a co-tenant process that can modify `cwd` could race a
symlink swap during this window.

**Windows recommendation:** always extract to a directory owned exclusively by
the calling process. Do not extract user-supplied archives into shared,
world-writable, or `TEMP`-like directories on Windows.

This gap is now closed: the Windows path uses `open(target, 'wx')` (atomic
exclusive create) with an unlink+retry pattern for legitimate overwrites. If a symlink
is injected between the unlink and the retry-open, extraction fails with a security error.
All writes and metadata operations are fd-based. See [SECURITY.md](./SECURITY.md#windows-symlink-swap-toctou)
for the full reparse-tag coverage table and user mitigations.

## Streaming Patterns

### Hash while creating

Compute a checksum over the compressed bytes as they are produced:

```typescript
import { create } from 'tar-xz';
import { createHash } from 'node:crypto';

const hasher = createHash('sha256');
const chunks: Uint8Array[] = [];

for await (const chunk of create({ files: [...] })) {
  hasher.update(chunk);
  chunks.push(chunk);
}

const digest = hasher.digest('hex');
console.log('SHA-256:', digest);
```

### HTTP upload

Stream the archive directly to an HTTP endpoint without buffering:

```typescript
import { create } from 'tar-xz';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const archiveStream = Readable.from(create({ files: [...] }));
// Use with node:http or any streaming HTTP client
```

### Extract from HTTP response (browser)

```typescript
import { extract } from 'tar-xz';

const response = await fetch('https://example.com/archive.tar.xz');
// ReadableStream<Uint8Array> is accepted directly
for await (const entry of extract(response.body!)) {
  if (entry.type === '0') {
    const text = await entry.text();
    console.log(entry.name, text);
  }
}
```

### Large file extraction to IndexedDB (browser)

```typescript
import { extract } from 'tar-xz';

const response = await fetch('large.tar.xz');
for await (const entry of extract(response.body!)) {
  if (entry.type === '0') {
    const bytes = await entry.bytes();
    // write to IndexedDB, OPFS, etc.
    await saveToStorage(entry.name, bytes);
  }
}
```

## API Reference

### Core API (`tar-xz`)

| Function | Signature | Returns |
|----------|-----------|---------|
| `create` | `(options: CreateOptions) => AsyncIterable<Uint8Array>` | Compressed archive chunks |
| `extract` | `(input: TarInput, options?: ExtractOptions) => AsyncIterable<TarEntryWithData>` | Entries with data |
| `list` | `(input: TarInput) => AsyncIterable<TarEntry>` | Metadata only |

### File Helpers API (`tar-xz/file`, Node only)

| Function | Signature | Returns |
|----------|-----------|---------|
| `createFile` | `(path: string, options: CreateOptions) => Promise<void>` | Writes archive to `path` |
| `extractFile` | `(archivePath: string, options?: ExtractOptions & { cwd?: string }) => Promise<void>` | Extracts to `cwd` |
| `listFile` | `(archivePath: string) => Promise<TarEntry[]>` | Collected entry array |

### `CreateOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `files` | `TarSourceFile[]` | required | Files to include |
| `preset` | `number` | `6` | XZ compression level 0–9 |
| `filter` | `(file: TarSourceFile) => boolean` | — | Return `false` to exclude |

### `TarSourceFile`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Path inside the archive |
| `source` | `string \| Uint8Array \| ArrayBuffer \| AsyncIterable<Uint8Array>` | File content or fs path (Node only) |
| `mode` | `number?` | File permissions (default: `0o644`) |
| `mtime` | `Date?` | Modification time (default: now) |

### `ExtractOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `strip` | `number` | `0` | Strip N leading path components |
| `filter` | `(entry: TarEntry) => boolean` | — | Return `false` to skip entry |

### `TarEntry`

Metadata yielded by `list()` and attached to each `TarEntryWithData`:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Relative file path |
| `type` | `TarEntryTypeValue` | Entry type (`'0'`=file, `'5'`=dir, `'2'`=symlink, …) |
| `size` | `number` | File size in bytes |
| `mode` | `number` | File permissions |
| `uid` / `gid` | `number` | Owner user/group IDs |
| `uname` / `gname` | `string` | Owner user/group names |
| `mtime` | `number` | Modification time (seconds since epoch) |
| `linkname` | `string` | Symlink / hardlink target |

### `TarEntryWithData` (extends `TarEntry`)

| Member | Description |
|--------|-------------|
| `data` | `AsyncIterable<Uint8Array>` — lazy content stream (consume once, in order) |
| `text(encoding?)` | Collect all chunks and decode to string (default UTF-8) |
| `bytes()` | Collect all chunks into a single `Uint8Array` |

## Compression Presets

| Preset | WASM Memory | Speed | Ratio | Recommendation |
|--------|------------|-------|-------|----------------|
| 1 | ~10 MB | Fastest | Lowest | Batch of many small files |
| 3 | ~20 MB | Fast | Good | Memory-constrained environments |
| 6 | ~100 MB | Medium | Very good | Default (Node + Browser) |
| 9 | ~700 MB | Slowest | Best | Archive longevity |

## Browser Limitations

- **No fs path source** — `source: '/path/to/file'` throws; use `Uint8Array` or `AsyncIterable` instead
- **256 MB WASM memory cap** — single-file content exceeding this limit will fail; batch large files carefully
- **No synchronous APIs** — all browser operations are async
- **Preset 1–6 recommended** — presets 7–9 approach or exceed the memory cap

## Compatibility

Archives produced by `tar-xz` are fully compatible with standard tooling:

```bash
# Extract with system tar
tar -xJf archive.tar.xz

# List contents
tar -tJf archive.tar.xz
```

## Migration: v5 → v6

v6 unifies the Node and browser APIs under a single set of function names.

### Renamed / removed exports

| v5 | v6 |
|----|----|
| `createTarXz(options)` | `create(options)` (browser entry point) |
| `extractTarXz(archive)` | `extract(archive)` (browser entry point) |
| `listTarXz(archive)` | `list(archive)` (browser entry point) |
| `extractToMemory(path)` | `extract(createReadStream(path))` + `entry.bytes()` |
| `BrowserCreateOptions` | `CreateOptions` |
| `BrowserExtractOptions` | `ExtractOptions` |
| `ExtractedFile` | `TarEntryWithData` |

### Return type changes

`create()` now returns `AsyncIterable<Uint8Array>` instead of `Promise<Uint8Array>`.
Collect all chunks if you need the full buffer:

```typescript
// v5
const archive = await createTarXz({ files: [...] });

// v6
const chunks: Uint8Array[] = [];
for await (const chunk of create({ files: [...] })) chunks.push(chunk);
const archive = Buffer.concat(chunks);  // Node
// or new Blob(chunks) for a Blob in browser
```

`extract()` now returns `AsyncIterable<TarEntryWithData>` instead of `Promise<Array<...>>`.
Iterate with `for await`:

```typescript
// v5
const files = await extractTarXz(archive);
for (const f of files) { /* f.name, f.data */ }

// v6
for await (const entry of extract(archive)) {
  if (entry.type === '0') {
    const data = await entry.bytes();  // f.data equivalent
  }
}
```

### Node-only file helpers moved to subpath

```typescript
// v5 (mixed in main export)
import { create, extract } from 'tar-xz';
await create({ file: 'archive.tar.xz', cwd: '.', files: ['a.txt'] });

// v6 (dedicated subpath)
import { createFile, extractFile } from 'tar-xz/file';
await createFile('archive.tar.xz', { files: [{ name: 'a.txt', source: 'a.txt' }] });
```

## Why tar-xz?

[node-tar](https://github.com/isaacs/node-tar) (230M+ downloads/month) does not
support `.tar.xz`. `tar-xz` fills that gap by combining:

- **node-liblzma** for XZ compression (native addon in Node, WASM in browser)
- A minimal POSIX ustar TAR implementation (no external dependencies)

## License

[LGPL-3.0](https://www.gnu.org/licenses/lgpl-3.0) — same as node-liblzma.
