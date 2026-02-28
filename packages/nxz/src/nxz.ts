#!/usr/bin/env node
/**
 * nxz - Node.js XZ compression CLI
 * A portable xz-like command line tool using node-liblzma
 */

import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import {
  check,
  createUnxz,
  createXz,
  hasThreads,
  isXZ,
  parseFileIndex,
  preset,
  unxzSync,
  versionString,
  xzSync,
} from 'node-liblzma';
import type { TarEntry } from 'tar-xz';

type TarXzModule = typeof import('tar-xz');
let tarXzModule: TarXzModule | null = null;

async function loadTarXz(): Promise<TarXzModule> {
  if (!tarXzModule) {
    try {
      tarXzModule = await import('tar-xz');
    } catch {
      throw new Error('tar-xz package not available. Install it with: pnpm add tar-xz');
    }
  }
  return tarXzModule;
}

/** CLI options parsed from arguments */
interface CliOptions {
  compress: boolean;
  decompress: boolean;
  list: boolean;
  benchmark: boolean;
  tar: boolean;
  keep: boolean;
  force: boolean;
  stdout: boolean;
  output: string | null;
  verbose: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
  preset: number;
  extreme: boolean;
  strip: number;
  files: string[];
}

/** Size threshold for using streams vs sync (1 MB) */
const STREAM_THRESHOLD_BYTES = 1024 * 1024;

/** Exit codes matching xz conventions */
const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;
const EXIT_SIGNAL = 128;

/** Track current output file for SIGINT cleanup */
let currentOutputFile: string | null = null;

/** Global quiet flag for warn() function */
let quietMode = false;

/**
 * Print warning message (respects -q flag)
 */
function warn(message: string): void {
  if (!quietMode) {
    console.error(message);
  }
}

/**
 * Setup SIGINT handler for graceful cleanup
 */
function setupSignalHandlers(): void {
  process.on('SIGINT', () => {
    // Cleanup partial output file if exists
    if (currentOutputFile && existsSync(currentOutputFile)) {
      try {
        unlinkSync(currentOutputFile);
      } catch {
        // Ignore cleanup errors
      }
    }
    // Exit with 128 + signal number (SIGINT = 2)
    process.exit(EXIT_SIGNAL + 2);
  });
}

/**
 * Parse command line arguments
 */
function parseCliArgs(args: string[]): CliOptions {
  // Extract preset from args (e.g., -0 through -9)
  let presetLevel = 6; // default
  const filteredArgs: string[] = [];

  for (const arg of args) {
    const presetMatch = arg.match(/^-(\d)$/);
    if (presetMatch) {
      presetLevel = Number.parseInt(presetMatch[1], 10);
    } else {
      filteredArgs.push(arg);
    }
  }

  const { values, positionals } = parseArgs({
    args: filteredArgs,
    options: {
      compress: { type: 'boolean', short: 'z', default: false },
      decompress: { type: 'boolean', short: 'd', default: false },
      list: { type: 'boolean', short: 'l', default: false },
      benchmark: { type: 'boolean', short: 'B', default: false },
      tar: { type: 'boolean', short: 'T', default: false },
      keep: { type: 'boolean', short: 'k', default: false },
      force: { type: 'boolean', short: 'f', default: false },
      stdout: { type: 'boolean', short: 'c', default: false },
      output: { type: 'string', short: 'o' },
      strip: { type: 'string', default: '0' },
      verbose: { type: 'boolean', short: 'v', default: false },
      quiet: { type: 'boolean', short: 'q', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'V', default: false },
      extreme: { type: 'boolean', short: 'e', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  return {
    compress: values.compress === true,
    decompress: values.decompress === true,
    list: values.list === true,
    benchmark: values.benchmark === true,
    tar: values.tar === true,
    keep: values.keep === true,
    force: values.force === true,
    stdout: values.stdout === true,
    output: typeof values.output === 'string' ? values.output : null,
    verbose: values.verbose === true,
    quiet: values.quiet === true,
    help: values.help === true,
    version: values.version === true,
    preset: presetLevel,
    extreme: values.extreme === true,
    strip: Number.parseInt(String(values.strip ?? '0'), 10),
    files: positionals,
  };
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`nxz - Node.js XZ compression CLI (using node-liblzma)

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

Report bugs at: https://github.com/oorabona/node-liblzma/issues`);
}

/**
 * Print version information
 */
function printVersion(): void {
  // Read package.json for nxz version
  const packageJsonPath = new URL('../package.json', import.meta.url);
  let nxzVersion = 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    nxzVersion = pkg.version;
  } catch {
    // Ignore error, use 'unknown'
  }

  const threadSupport = hasThreads() ? 'yes' : 'no';
  const year = new Date().getFullYear();
  console.log(`nxz ${nxzVersion}
node-liblzma using liblzma ${versionString()}
Thread support: ${threadSupport}

Copyright (C) ${year} Olivier ORABONA
License: LGPL-3.0`);
}

/**
 * Check if file is a tar.xz archive based on extension
 */
function isTarXzFile(filename: string): boolean {
  return filename.endsWith('.tar.xz') || filename.endsWith('.txz');
}

/**
 * Determine operation mode based on options and file extension
 */
function determineMode(
  options: CliOptions,
  filename: string
): 'compress' | 'decompress' | 'list' | 'benchmark' | 'tar-list' | 'tar-create' | 'tar-extract' {
  if (options.benchmark) return 'benchmark';

  // Tar mode: explicit -T flag or auto-detected from extension
  const isTar = options.tar || isTarXzFile(filename);

  if (isTar) {
    if (options.list) return 'tar-list';
    if (options.decompress) return 'tar-extract';
    if (options.compress) return 'tar-create';
    // Auto-detect: if file exists and is .tar.xz/.txz, extract; otherwise create
    if (isTarXzFile(filename)) {
      return options.list ? 'tar-list' : 'tar-extract';
    }
    return 'tar-create';
  }

  if (options.list) return 'list';
  if (options.decompress) return 'decompress';
  if (options.compress) return 'compress';

  // Auto-detect from extension
  if (filename.endsWith('.xz') || filename.endsWith('.lzma')) {
    return 'decompress';
  }
  return 'compress';
}

/**
 * Get output filename based on operation mode
 */
function getOutputFilename(inputFile: string, mode: 'compress' | 'decompress'): string {
  if (mode === 'compress') {
    return `${inputFile}.xz`;
  }
  // Decompress: remove .xz or .lzma extension
  if (inputFile.endsWith('.xz')) {
    return inputFile.slice(0, -3);
  }
  if (inputFile.endsWith('.lzma')) {
    return inputFile.slice(0, -5);
  }
  return `${inputFile}.out`;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}

/**
 * List information about an XZ file
 */
function listFile(filename: string, options: CliOptions): number {
  try {
    const data = readFileSync(filename);
    const info = parseFileIndex(data);

    const ratio =
      info.compressedSize > 0
        ? ((1 - info.uncompressedSize / info.compressedSize) * -100).toFixed(1)
        : '0.0';

    const checkNames: Record<number, string> = {
      [check.NONE]: 'None',
      [check.CRC32]: 'CRC32',
      [check.CRC64]: 'CRC64',
      [check.SHA256]: 'SHA-256',
    };
    const checkName = checkNames[info.check] ?? `Unknown(${info.check})`;

    if (options.verbose) {
      console.log(`File: ${filename}`);
      console.log(`  Streams:        ${info.streamCount}`);
      console.log(`  Blocks:         ${info.blockCount}`);
      console.log(`  Compressed:     ${formatBytes(info.compressedSize)}`);
      console.log(`  Uncompressed:   ${formatBytes(info.uncompressedSize)}`);
      console.log(`  Ratio:          ${ratio}%`);
      console.log(`  Check:          ${checkName}`);
      console.log(`  Memory needed:  ${formatBytes(info.memoryUsage)}`);
    } else {
      // Compact format similar to xz -l
      console.log('Strms  Blocks   Compressed Uncompressed  Ratio  Check   Filename');
      console.log(
        `    ${info.streamCount}       ${info.blockCount}  ${formatBytes(info.compressedSize).padStart(12)}  ${formatBytes(info.uncompressedSize).padStart(12)}  ${ratio.padStart(5)}%  ${checkName.padEnd(6)}  ${filename}`
      );
    }

    return EXIT_SUCCESS;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`nxz: ${filename}: ${message}`);
    return EXIT_ERROR;
  }
}

/**
 * Compress a file
 */

/** Resolve output file and check for overwrites. Returns null for stdout mode. */
function resolveOutputFile(
  inputFile: string,
  mode: 'compress' | 'decompress',
  options: CliOptions
): string | null {
  if (options.stdout) return null;
  return options.output ?? getOutputFilename(inputFile, mode);
}

/** Attach verbose progress tracking to a stream. */
function attachProgress(
  stream: {
    on(event: 'progress', cb: (p: { bytesRead: number; bytesWritten: number }) => void): void;
  },
  inputFile: string,
  totalSize: number
): void {
  let lastPercent = -1;
  stream.on('progress', ({ bytesRead, bytesWritten }) => {
    const percent = Math.floor((bytesRead / totalSize) * 100);
    if (percent !== lastPercent) {
      lastPercent = percent;
      process.stderr.write(
        `\r${inputFile}: ${percent}% (${formatBytes(bytesRead)} -> ${formatBytes(bytesWritten)})`
      );
    }
  });
}

/** Clean up a partial output file and reset tracking state. */
function cleanupPartialOutput(outputFile: string | null): void {
  if (outputFile && existsSync(outputFile)) {
    try {
      unlinkSync(outputFile);
    } catch {
      // Ignore cleanup errors
    }
  }
  currentOutputFile = null;
}

/** Read file content using fd-based operations (avoids TOCTOU race). Returns [data, fileSize]. */
function readFileSafe(inputFile: string): { data: Buffer; size: number } {
  const fd = openSync(inputFile, 'r');
  try {
    const size = fstatSync(fd).size;
    const data = readFileSync(fd);
    return { data, size };
  } finally {
    closeSync(fd);
  }
}

/** Write compressed/decompressed output to stdout or file. */
function writeOutput(output: Buffer | Uint8Array, outputFile: string | null): void {
  if (outputFile) {
    writeFileSync(outputFile, output);
  } else {
    process.stdout.write(output);
  }
}

/** Delete the original file after successful compression/decompression. */
function removeOriginalIfNeeded(inputFile: string, options: CliOptions): void {
  if (!options.keep && !options.stdout) {
    unlinkSync(inputFile);
  }
}

async function compressFile(inputFile: string, options: CliOptions): Promise<number> {
  const outputFile = resolveOutputFile(inputFile, 'compress', options);

  if (outputFile && existsSync(outputFile) && !options.force) {
    warn(`nxz: ${outputFile}: File already exists; use -f to overwrite`);
    return EXIT_ERROR;
  }

  currentOutputFile = outputFile;

  try {
    const { data, size } = readFileSafe(inputFile);
    const presetValue = options.extreme ? options.preset | preset.EXTREME : options.preset;

    if (!outputFile || size <= STREAM_THRESHOLD_BYTES) {
      // Stdout or small file: sync compression
      const compressed = xzSync(data, { preset: presetValue });
      writeOutput(compressed, outputFile);
    } else {
      // Large file: stream compression with optional progress
      const compressor = createXz({ preset: presetValue });
      if (options.verbose) {
        attachProgress(compressor, inputFile, size);
      }
      await pipeline(createReadStream(inputFile), compressor, createWriteStream(outputFile));
      if (options.verbose) {
        process.stderr.write('\n');
      }
    }

    removeOriginalIfNeeded(inputFile, options);
    currentOutputFile = null;
    return EXIT_SUCCESS;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`nxz: ${inputFile}: ${message}`);
    cleanupPartialOutput(outputFile);
    return EXIT_ERROR;
  }
}

/**
 * Decompress a file
 */
async function decompressFile(inputFile: string, options: CliOptions): Promise<number> {
  const outputFile = resolveOutputFile(inputFile, 'decompress', options);

  if (outputFile && existsSync(outputFile) && !options.force) {
    warn(`nxz: ${outputFile}: File already exists; use -f to overwrite`);
    return EXIT_ERROR;
  }

  currentOutputFile = outputFile;

  try {
    const { data, size } = readFileSafe(inputFile);

    if (!isXZ(data)) {
      warn(`nxz: ${inputFile}: File format not recognized`);
      currentOutputFile = null;
      return EXIT_ERROR;
    }

    if (!outputFile || size <= STREAM_THRESHOLD_BYTES) {
      // Stdout or small file: sync decompression
      const decompressed = unxzSync(data);
      writeOutput(decompressed, outputFile);
    } else {
      // Large file: stream decompression with optional progress
      const decompressor = createUnxz();
      if (options.verbose) {
        attachProgress(decompressor, inputFile, size);
      }
      await pipeline(createReadStream(inputFile), decompressor, createWriteStream(outputFile));
      if (options.verbose) {
        process.stderr.write('\n');
      }
    }

    removeOriginalIfNeeded(inputFile, options);
    currentOutputFile = null;
    return EXIT_SUCCESS;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`nxz: ${inputFile}: ${message}`);
    cleanupPartialOutput(outputFile);
    return EXIT_ERROR;
  }
}

/**
 * Process a single file
 */

/** Measure execution time of an async function in milliseconds. */
async function measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - start };
}

/** Measure execution time of a sync function in milliseconds. */
function measureSync<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  return { result, ms: performance.now() - start };
}

/** Format milliseconds for display. */
function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Format a ratio as "Nx faster" or "Nx slower". */
function formatSpeedup(baseline: number, candidate: number): string {
  if (candidate === 0 || baseline === 0) return 'N/A';
  const ratio = baseline / candidate;
  if (ratio >= 1) return `${ratio.toFixed(1)}x faster`;
  return `${(1 / ratio).toFixed(1)}x slower`;
}

/**
 * Benchmark native vs WASM compression/decompression on a file.
 */
async function benchmarkFile(inputFile: string, options: CliOptions): Promise<number> {
  // Initialize WASM module with Node.js file-based loader
  const {
    initModule,
    resetModule,
    xzAsync: wasmXzAsync,
    unxzAsync: wasmUnxzAsync,
  } = await import('node-liblzma/wasm');
  const { readFileSync: fsReadFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');

  const wasmPath = fileURLToPath(import.meta.resolve('node-liblzma/wasm/liblzma.wasm'));

  resetModule();
  await initModule(async () => {
    const { default: createLZMA } = await import('node-liblzma/wasm/liblzma.js');
    const wasmBinary = fsReadFileSync(wasmPath);
    return (await createLZMA({ wasmBinary })) as import('node-liblzma/wasm').LZMAModule;
  });

  const { data, size } = readFileSafe(inputFile);
  const presetValue = options.extreme ? options.preset | preset.EXTREME : options.preset;

  console.error(
    `\nBenchmark: ${inputFile} (${formatBytes(size)}, preset ${options.preset}${options.extreme ? 'e' : ''})\n`
  );

  // --- Compression ---
  const nativeCompress = measureSync(() => xzSync(data, { preset: presetValue }));
  const wasmCompress = await measureAsync(() => wasmXzAsync(data, { preset: presetValue }));

  // --- Decompression ---
  const nativeDecompress = measureSync(() => unxzSync(nativeCompress.result));
  const wasmDecompress = await measureAsync(() => wasmUnxzAsync(wasmCompress.result));

  // --- Verify correctness ---
  const nativeOk = Buffer.compare(nativeDecompress.result, data) === 0;
  const wasmOk = Buffer.compare(Buffer.from(wasmDecompress.result), data) === 0;

  // --- Cross-decompression ---
  const crossNativeToWasm = await measureAsync(() => wasmUnxzAsync(nativeCompress.result));
  const crossWasmToNative = measureSync(() => unxzSync(Buffer.from(wasmCompress.result)));
  const crossOk1 = Buffer.compare(Buffer.from(crossNativeToWasm.result), data) === 0;
  const crossOk2 = Buffer.compare(crossWasmToNative.result, data) === 0;

  // --- Output table ---
  const col1 = 22;
  const col2 = 16;
  const col3 = 16;
  const col4 = 18;
  const sep = '-'.repeat(col1 + col2 + col3 + col4 + 7);

  const row = (label: string, native: string, wasm: string, diff: string) =>
    `  ${label.padEnd(col1)} ${native.padStart(col2)} ${wasm.padStart(col3)} ${diff.padStart(col4)}`;

  console.error(sep);
  console.error(row('', 'Native', 'WASM', 'Comparison'));
  console.error(sep);
  console.error(
    row(
      'Compress time',
      formatMs(nativeCompress.ms),
      formatMs(wasmCompress.ms),
      formatSpeedup(wasmCompress.ms, nativeCompress.ms)
    )
  );
  console.error(
    row(
      'Compressed size',
      formatBytes(nativeCompress.result.length),
      formatBytes(wasmCompress.result.length),
      nativeCompress.result.length === wasmCompress.result.length
        ? 'identical'
        : `${((wasmCompress.result.length / nativeCompress.result.length - 1) * 100).toFixed(1)}%`
    )
  );
  console.error(
    row(
      'Decompress time',
      formatMs(nativeDecompress.ms),
      formatMs(wasmDecompress.ms),
      formatSpeedup(wasmDecompress.ms, nativeDecompress.ms)
    )
  );
  console.error(row('Roundtrip OK', nativeOk ? 'YES' : 'FAIL', wasmOk ? 'YES' : 'FAIL', ''));
  console.error(sep);
  console.error(
    row('Cross: Native→WASM', '', formatMs(crossNativeToWasm.ms), crossOk1 ? 'OK' : 'FAIL')
  );
  console.error(
    row('Cross: WASM→Native', formatMs(crossWasmToNative.ms), '', crossOk2 ? 'OK' : 'FAIL')
  );
  console.error(sep);

  const allOk = nativeOk && wasmOk && crossOk1 && crossOk2;
  console.error(
    `\n  Verdict: ${allOk ? 'ALL PASS — Both backends produce valid output' : 'FAIL — Data mismatch detected'}\n`
  );

  // Reset WASM module to not interfere with other operations
  resetModule();

  return allOk ? EXIT_SUCCESS : EXIT_ERROR;
}

/**
 * List contents of a tar.xz archive
 */
async function listTarFile(filename: string, options: CliOptions): Promise<number> {
  try {
    const tarXz = await loadTarXz();
    const entries: TarEntry[] = await tarXz.list({ file: filename });

    if (options.verbose) {
      // Verbose format with permissions, size, date
      for (const entry of entries) {
        const typeChar = entry.type === '5' ? 'd' : '-';
        const modeStr = entry.mode?.toString(8).padStart(4, '0') ?? '0644';
        const size = formatBytes(entry.size).padStart(10);
        const date = entry.mtime ? new Date(entry.mtime * 1000).toISOString().slice(0, 16) : '';
        console.log(`${typeChar}${modeStr} ${size} ${date} ${entry.name}`);
      }
    } else {
      // Simple format: just names
      for (const entry of entries) {
        console.log(entry.name);
      }
    }

    if (!options.quiet) {
      console.error(`\nTotal: ${entries.length} entries`);
    }

    return EXIT_SUCCESS;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`nxz: ${filename}: ${message}`);
    return EXIT_ERROR;
  }
}

/**
 * Create a tar.xz archive from files/directories
 */
function findCommonParent(paths: string[]): string {
  if (paths.length === 0) return process.cwd();
  if (paths.length === 1) return paths[0];
  const parts = paths.map((p) => p.split('/'));
  const common: string[] = [];
  for (let i = 0; i < parts[0].length; i++) {
    const segment = parts[0][i];
    if (parts.every((p) => p[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }
  return common.join('/') || '/';
}

async function createTarFile(files: string[], options: CliOptions): Promise<number> {
  try {
    const tarXz = await loadTarXz();
    const path = await import('node:path');

    // Determine output filename
    let outputFile = options.output;
    if (!outputFile) {
      // Use first file/dir name as base
      const base = path.basename(files[0]).replace(/\/$/, '');
      outputFile = `${base}.tar.xz`;
    }

    if (existsSync(outputFile) && !options.force) {
      warn(`nxz: ${outputFile}: File already exists; use -f to overwrite`);
      return EXIT_ERROR;
    }

    currentOutputFile = outputFile;

    // Resolve all files to absolute paths for consistent handling
    const resolvedFiles = files.map((f) => path.resolve(f));

    // Determine cwd (common parent directory)
    let cwd: string;
    if (resolvedFiles.length === 1 && statSync(resolvedFiles[0]).isDirectory()) {
      cwd = resolvedFiles[0];
    } else {
      // Find common parent of all files
      const parents = resolvedFiles.map((f) => (statSync(f).isDirectory() ? f : path.dirname(f)));
      // Use the first file's parent as cwd for simple cases
      cwd = parents.length === 1 ? parents[0] : findCommonParent(parents);
    }

    // Collect files to archive (relative to cwd)
    const filesToArchive: string[] = [];
    for (const file of resolvedFiles) {
      if (statSync(file).isDirectory()) {
        const { readdirSync } = await import('node:fs');
        const entries = readdirSync(file, { recursive: true, withFileTypes: true });
        const dirRelative = path.relative(cwd, file);
        for (const entry of entries) {
          if (entry.isFile()) {
            const entryPath =
              entry.parentPath === file
                ? entry.name
                : `${entry.parentPath.slice(file.length + 1)}/${entry.name}`;
            filesToArchive.push(dirRelative ? `${dirRelative}/${entryPath}` : entryPath);
          }
        }
      } else {
        filesToArchive.push(path.relative(cwd, file));
      }
    }

    const presetValue = options.extreme ? options.preset | preset.EXTREME : options.preset;

    if (options.verbose) {
      console.error(`Creating ${outputFile} from ${filesToArchive.length} files...`);
    }

    await tarXz.create({
      file: outputFile,
      cwd,
      files: filesToArchive,
      preset: presetValue,
    });

    if (options.verbose) {
      const stats = statSync(outputFile);
      console.error(`Created ${outputFile} (${formatBytes(stats.size)})`);
    }

    currentOutputFile = null;
    return EXIT_SUCCESS;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`nxz: ${message}`);
    cleanupPartialOutput(currentOutputFile);
    return EXIT_ERROR;
  }
}

/**
 * Extract a tar.xz archive
 */
async function extractTarFile(filename: string, options: CliOptions): Promise<number> {
  try {
    const tarXz = await loadTarXz();

    // Determine output directory
    const outputDir = options.output ?? process.cwd();

    // Create output directory if it doesn't exist
    if (!existsSync(outputDir)) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(outputDir, { recursive: true });
    }

    if (options.verbose) {
      console.error(`Extracting ${filename} to ${outputDir}...`);
    }

    const entries = await tarXz.extract({
      file: filename,
      cwd: outputDir,
      strip: options.strip,
    });

    if (options.verbose) {
      for (const entry of entries) {
        console.error(`  ${entry.name}`);
      }
      console.error(`\nExtracted ${entries.length} entries`);
    }

    // Delete original if not keeping
    removeOriginalIfNeeded(filename, options);

    return EXIT_SUCCESS;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`nxz: ${filename}: ${message}`);
    return EXIT_ERROR;
  }
}

async function processFile(filename: string, options: CliOptions): Promise<number> {
  // Check file exists
  if (!existsSync(filename)) {
    warn(`nxz: ${filename}: No such file or directory`);
    return EXIT_ERROR;
  }

  const isDir = statSync(filename).isDirectory();
  const mode = determineMode(options, filename);

  // Directories are only allowed for tar-create mode
  if (isDir && mode !== 'tar-create') {
    warn(`nxz: ${filename}: Is a directory, skipping`);
    return EXIT_ERROR;
  }

  switch (mode) {
    case 'list':
      return listFile(filename, options);
    case 'benchmark':
      return benchmarkFile(filename, options);
    case 'compress':
      return compressFile(filename, options);
    case 'decompress':
      return decompressFile(filename, options);
    case 'tar-list':
      return listTarFile(filename, options);
    case 'tar-extract':
      return extractTarFile(filename, options);
    case 'tar-create':
      // tar-create is handled separately since it takes multiple files
      return EXIT_SUCCESS;
  }
}

/**
 * Read from stdin and process
 */
async function processStdin(options: CliOptions): Promise<number> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const input = Buffer.concat(chunks);
  const mode = options.decompress ? 'decompress' : 'compress';

  try {
    if (mode === 'compress') {
      const presetValue = options.extreme ? options.preset | preset.EXTREME : options.preset;
      const compressed = xzSync(input, { preset: presetValue });
      process.stdout.write(compressed);
    } else {
      if (!isXZ(input)) {
        warn('nxz: (stdin): File format not recognized');
        return EXIT_ERROR;
      }
      const decompressed = unxzSync(input);
      process.stdout.write(decompressed);
    }
    return EXIT_SUCCESS;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`nxz: (stdin): ${message}`);
    return EXIT_ERROR;
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Setup signal handlers for graceful cleanup
  setupSignalHandlers();

  const options = parseCliArgs(process.argv.slice(2));

  // Set global quiet mode
  quietMode = options.quiet;

  // Handle help and version first
  if (options.help) {
    printHelp();
    process.exit(EXIT_SUCCESS);
  }

  if (options.version) {
    printVersion();
    process.exit(EXIT_SUCCESS);
  }

  // No files: read from stdin
  if (options.files.length === 0 || (options.files.length === 1 && options.files[0] === '-')) {
    const exitCode = await processStdin(options);
    process.exit(exitCode);
  }

  // Check for tar-create mode: -T with files that aren't .tar.xz archives
  if (options.files.length > 0) {
    const mode = determineMode(options, options.files[0]);
    if (mode === 'tar-create') {
      const exitCode = await createTarFile(options.files, options);
      process.exit(exitCode);
    }
  }

  // Process each file
  let exitCode = EXIT_SUCCESS;
  for (const file of options.files) {
    if (file === '-') {
      const code = await processStdin(options);
      if (code !== EXIT_SUCCESS) exitCode = code;
    } else {
      const code = await processFile(file, options);
      if (code !== EXIT_SUCCESS) exitCode = code;
    }
  }

  process.exit(exitCode);
}

// Run main
main().catch((err) => {
  console.error(`nxz: ${err.message}`);
  process.exit(EXIT_ERROR);
});
