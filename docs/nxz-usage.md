# nxz CLI

`nxz` is a portable, Node.js-powered XZ compression CLI — a drop-in alternative to the
system `xz` utility that also handles `.tar.xz` archives.
It is published as [`nxz-cli`](https://www.npmjs.com/package/nxz-cli) on npm and backed by
[node-liblzma](https://github.com/oorabona/node-liblzma).

## Install

```bash
# npm
npm install -g nxz-cli

# pnpm
pnpm add -g nxz-cli

# Run without installing
npx nxz-cli --help
```

## Usage

```
nxz - Node.js XZ compression CLI (using node-liblzma)

Usage: nxz [OPTION]... [FILE]...

Compress or decompress FILEs in the .xz format.

Operation mode:
  -z, --compress    force compression
  -d, --decompress  force decompression
  -l, --list        list information about .xz files
  -B, --benchmark   benchmark native vs WASM compression

Archive mode (tar.xz):
  -T, --tar         treat file as tar.xz archive
                    Auto-detected for .tar.xz and .txz files
  --strip=N         strip N leading path components on extract (default: 0)

Operation modifiers:
  -k, --keep        keep (don't delete) input files
  -f, --force       force overwrite of output file
  -c, --stdout      write to standard output and don't delete input files
  -o, --output=FILE write output to FILE (or directory for tar extract)
  --memlimit-decompress=SIZE
                    limit decompressor memory usage (e.g. 256MiB, 1GiB, 512KB,
                    268435456); use 0 or max for no limit
                    (IEC suffixes 1024-based, SI suffixes 1000-based,
                    integer mantissa only)

Compression presets:
  -0 ... -9         compression preset level (default: 6)
  -e, --extreme     use extreme compression (slower)

Other options:
  -v, --verbose     be verbose (show progress)
  -q, --quiet       suppress warnings
  -h, --help        display this help and exit
  -V, --version     display version information and exit

With no FILE, or when FILE is -, read standard input.

Examples:
  nxz file.txt              compress file.txt to file.txt.xz
  nxz -d file.xz            decompress file.xz
  nxz -T -z dir/            create archive.tar.xz from dir/
  nxz -l archive.tar.xz     list contents of archive
  nxz -d archive.tar.xz     extract archive to current directory
  nxz -d -o dest/ arch.txz  extract archive to dest/

Report bugs at: https://github.com/oorabona/node-liblzma/issues
```

## Common examples

### Compress a file

```bash
nxz file.txt          # produces file.txt.xz, removes file.txt
nxz -k file.txt       # keep the original
nxz -9e file.txt      # maximum compression (level 9 + extreme)
```

### Decompress a file

```bash
nxz -d file.txt.xz
nxz -d -k file.txt.xz   # keep the .xz file
```

### Create a .tar.xz archive

```bash
# Archive a directory
nxz -T src/ lib/ -o project.tar.xz

# Or pipe via stdout
nxz -T -c src/ > src.tar.xz
```

### List archive contents

```bash
nxz -l archive.tar.xz
```

### Extract a .tar.xz archive

```bash
nxz -d archive.tar.xz              # extract to current directory
nxz -d archive.tar.xz -o dest/     # extract to dest/
nxz -d archive.tar.xz --strip=1    # strip one leading path component
```

### Memory-constrained decompression

```bash
nxz -d --memlimit-decompress=128MiB large.xz
nxz -d --memlimit-decompress=0 huge.xz      # no limit
```

### Benchmark native vs WASM

```bash
nxz -B file.txt
```

## Source

[github.com/oorabona/node-liblzma/tree/master/packages/nxz](https://github.com/oorabona/node-liblzma/tree/master/packages/nxz)
