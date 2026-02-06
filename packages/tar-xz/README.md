# tar-xz

Create and extract tar.xz archives with streaming support for Node.js and buffer-based API for browsers.

## Features

- **Node.js streaming API** - Memory-efficient processing of large archives
- **Browser support** - WASM-powered XZ compression works in any browser
- **Full TAR support** - POSIX ustar format with PAX extensions for long filenames
- **TypeScript** - Full type definitions included
- **Zero dependencies** - Only requires `node-liblzma` (workspace dependency)

## Installation

```bash
npm install tar-xz
# or
pnpm add tar-xz
# or
yarn add tar-xz
```

## Usage

### Node.js

```typescript
import { create, extract, list } from 'tar-xz';

// Create an archive
await create({
  file: 'archive.tar.xz',
  cwd: '/source/directory',
  files: ['file1.txt', 'subdir/'],
  preset: 6 // compression level (0-9)
});

// List contents
const entries = await list({ file: 'archive.tar.xz' });
for (const entry of entries) {
  console.log(entry.name, entry.size);
}

// Extract to disk
await extract({
  file: 'archive.tar.xz',
  cwd: '/destination',
  strip: 1, // remove leading path component
  filter: (entry) => !entry.name.startsWith('.') // skip hidden files
});

// Extract to memory
import { extractToMemory } from 'tar-xz';
const files = await extractToMemory('archive.tar.xz');
for (const file of files) {
  console.log(file.name, file.content.toString());
}
```

### Browser

```typescript
import { createTarXz, extractTarXz, listTarXz } from 'tar-xz';

// Create from files (e.g., from file input or drag & drop)
const archive = await createTarXz({
  files: [
    { name: 'hello.txt', content: 'Hello, World!' },
    { name: 'data.json', content: JSON.stringify({ foo: 'bar' }) }
  ],
  preset: 3 // lower preset for browser performance
});

// Download the archive
const blob = new Blob([archive], { type: 'application/x-xz' });
const url = URL.createObjectURL(blob);
// ... trigger download

// Extract an archive
const response = await fetch('archive.tar.xz');
const data = await response.arrayBuffer();
const files = await extractTarXz(data);

for (const file of files) {
  console.log(file.name, file.data.length);
}

// List contents only (no extraction)
const entries = await listTarXz(data);
```

## API Reference

### Node.js API

#### `create(options: CreateOptions): Promise<void>`

Create a tar.xz archive from files on disk.

Options:
- `file` - Output archive path
- `cwd` - Base directory for file paths (default: `process.cwd()`)
- `files` - Array of file/directory paths to include
- `preset` - XZ compression preset 0-9 (default: 6)
- `follow` - Follow symbolic links (default: false)

#### `extract(options: ExtractOptions): Promise<TarEntry[]>`

Extract a tar.xz archive to disk.

Options:
- `file` - Input archive path
- `cwd` - Output directory (default: `process.cwd()`)
- `strip` - Number of leading path components to strip (default: 0)
- `filter` - Function to filter entries
- `preserveOwner` - Preserve file ownership (requires root)

#### `list(options: ListOptions): Promise<TarEntry[]>`

List contents of a tar.xz archive.

#### `extractToMemory(file: string, options?): Promise<Array<TarEntry & { content: Buffer }>>`

Extract archive to memory without writing to disk.

### Browser API

#### `createTarXz(options: BrowserCreateOptions): Promise<Uint8Array>`

Create a tar.xz archive from in-memory files.

Options:
- `files` - Array of `{ name, content, mode?, mtime? }`
- `preset` - XZ compression preset 0-9 (default: 3)

#### `extractTarXz(archive: ArrayBuffer | Uint8Array, options?): Promise<ExtractedFile[]>`

Extract a tar.xz archive to memory.

Options:
- `strip` - Number of leading path components to strip
- `filter` - Function to filter entries

#### `listTarXz(archive: ArrayBuffer | Uint8Array): Promise<TarEntry[]>`

List contents of a tar.xz archive.

## Low-level API

For advanced usage, the package also exports low-level TAR utilities:

```typescript
import {
  BLOCK_SIZE,
  createHeader,
  parseHeader,
  calculatePadding,
  createEndOfArchive,
  needsPaxHeaders,
  createPaxHeaderBlocks,
} from 'tar-xz';
```

## Compression Presets

| Preset | Memory Usage | Speed | Ratio |
|--------|-------------|-------|-------|
| 1 | ~10 MB | Fastest | Lowest |
| 3 | ~20 MB | Fast | Good (browser default) |
| 6 | ~100 MB | Medium | Very Good (Node default) |
| 9 | ~700 MB | Slowest | Best |

For browser usage, presets 1-6 are recommended to avoid memory issues.

## Compatibility

Archives created with `tar-xz` are fully compatible with standard tools:

```bash
# Extract with system tar
tar -xJf archive.tar.xz

# List contents
tar -tJf archive.tar.xz

# Create (for reference)
tar -cJf archive.tar.xz files/
```

## Why tar-xz?

The popular `node-tar` package (226M downloads/month) does not support `.tar.xz` files.
While there are open issues requesting this feature, the maintainer prefers external libraries handle it.

`tar-xz` fills this gap by combining:
- **node-liblzma** for XZ compression (native + WASM)
- A minimal TAR implementation (no external dependencies)

## License

LGPL-3.0 - Same as node-liblzma
