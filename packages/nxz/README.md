# nxz

Portable `xz`-like CLI tool for Node.js — compress, decompress, and handle `.tar.xz` archives.

Powered by [node-liblzma](https://github.com/oorabona/node-liblzma).

## Quick Start

```bash
# Run without installing
npx nxz file.txt              # → file.txt.xz

# Or install globally
npm install -g nxz
nxz file.txt
```

## Usage

```bash
# Compress
nxz file.txt                   # → file.txt.xz
nxz -9e file.txt               # Max compression

# Decompress
nxz -d file.txt.xz             # → file.txt

# Create tar.xz archive
nxz -T src/ lib/ -o project.tar.xz

# List archive contents
nxz -Tl project.tar.xz

# Extract archive
nxz -Td project.tar.xz -o output/

# Benchmark native vs WASM
nxz -B file.txt
```

Run `nxz --help` for all options.

## License

LGPL-3.0
