#!/usr/bin/env node
/**
 * nxz - Node.js XZ compression CLI
 * A portable xz-like command line tool using node-liblzma
 */

import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
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
} from '../lzma.js';

/** CLI options parsed from arguments */
interface CliOptions {
  compress: boolean;
  decompress: boolean;
  list: boolean;
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
      keep: { type: 'boolean', short: 'k', default: false },
      force: { type: 'boolean', short: 'f', default: false },
      stdout: { type: 'boolean', short: 'c', default: false },
      output: { type: 'string', short: 'o' },
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

Operation modifiers:
  -k, --keep        keep (don't delete) input files
  -f, --force       force overwrite of output file
  -c, --stdout      write to standard output and don't delete input files
  -o, --output=FILE write output to FILE

Compression presets:
  -0 ... -9         compression preset level (default: 6)
  -e, --extreme     use extreme compression (slower)

Other options:
  -v, --verbose     be verbose (show progress)
  -q, --quiet       suppress warnings
  -h, --help        display this help and exit
  -V, --version     display version information and exit

With no FILE, or when FILE is -, read standard input.

Report bugs at: https://github.com/oorabona/node-liblzma/issues`);
}

/**
 * Print version information
 */
function printVersion(): void {
  // Read package.json for nxz version
  const packageJsonPath = new URL('../../package.json', import.meta.url);
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
 * Determine operation mode based on options and file extension
 */
function determineMode(options: CliOptions, filename: string): 'compress' | 'decompress' | 'list' {
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
async function compressFile(inputFile: string, options: CliOptions): Promise<number> {
  const outputFile = options.stdout
    ? null
    : (options.output ?? getOutputFilename(inputFile, 'compress'));

  // Check if output exists
  if (outputFile && existsSync(outputFile) && !options.force) {
    warn(`nxz: ${outputFile}: File already exists; use -f to overwrite`);
    return EXIT_ERROR;
  }

  // Track output file for SIGINT cleanup
  currentOutputFile = outputFile;

  try {
    const stat = statSync(inputFile);
    const presetValue = options.extreme ? options.preset | preset.EXTREME : options.preset;

    if (options.stdout) {
      // Write to stdout
      const input = readFileSync(inputFile);
      const compressed = xzSync(input, { preset: presetValue });
      process.stdout.write(compressed);
    } else if (stat.size <= STREAM_THRESHOLD_BYTES) {
      // Small file: use sync
      const input = readFileSync(inputFile);
      const compressed = xzSync(input, { preset: presetValue });
      writeFileSync(outputFile!, compressed);
    } else {
      // Large file: use streams
      const compressor = createXz({ preset: presetValue });

      if (options.verbose) {
        let lastPercent = -1;
        compressor.on('progress', ({ bytesRead, bytesWritten }) => {
          const percent = Math.floor((bytesRead / stat.size) * 100);
          if (percent !== lastPercent) {
            lastPercent = percent;
            process.stderr.write(
              `\r${inputFile}: ${percent}% (${formatBytes(bytesRead)} -> ${formatBytes(bytesWritten)})`
            );
          }
        });
      }

      await pipeline(createReadStream(inputFile), compressor, createWriteStream(outputFile!));

      if (options.verbose) {
        process.stderr.write('\n');
      }
    }

    // Delete original unless -k or -c
    if (!options.keep && !options.stdout) {
      unlinkSync(inputFile);
    }

    // Clear tracking after successful completion
    currentOutputFile = null;
    return EXIT_SUCCESS;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`nxz: ${inputFile}: ${message}`);
    // Cleanup partial output
    if (outputFile && existsSync(outputFile)) {
      try {
        unlinkSync(outputFile);
      } catch {
        // Ignore cleanup errors
      }
    }
    currentOutputFile = null;
    return EXIT_ERROR;
  }
}

/**
 * Decompress a file
 */
async function decompressFile(inputFile: string, options: CliOptions): Promise<number> {
  const outputFile = options.stdout
    ? null
    : (options.output ?? getOutputFilename(inputFile, 'decompress'));

  // Check if output exists
  if (outputFile && existsSync(outputFile) && !options.force) {
    warn(`nxz: ${outputFile}: File already exists; use -f to overwrite`);
    return EXIT_ERROR;
  }

  // Track output file for SIGINT cleanup
  currentOutputFile = outputFile;

  try {
    // Validate XZ format
    const fd = readFileSync(inputFile);
    if (!isXZ(fd)) {
      warn(`nxz: ${inputFile}: File format not recognized`);
      currentOutputFile = null;
      return EXIT_ERROR;
    }

    const stat = statSync(inputFile);

    if (options.stdout) {
      // Write to stdout
      const decompressed = unxzSync(fd);
      process.stdout.write(decompressed);
    } else if (stat.size <= STREAM_THRESHOLD_BYTES) {
      // Small file: use sync
      const decompressed = unxzSync(fd);
      writeFileSync(outputFile!, decompressed);
    } else {
      // Large file: use streams with progress
      const decompressor = createUnxz();

      if (options.verbose) {
        let lastPercent = -1;
        decompressor.on('progress', ({ bytesRead, bytesWritten }) => {
          const percent = Math.floor((bytesRead / stat.size) * 100);
          if (percent !== lastPercent) {
            lastPercent = percent;
            process.stderr.write(
              `\r${inputFile}: ${percent}% (${formatBytes(bytesRead)} -> ${formatBytes(bytesWritten)})`
            );
          }
        });
      }

      await pipeline(createReadStream(inputFile), decompressor, createWriteStream(outputFile!));

      if (options.verbose) {
        process.stderr.write('\n');
      }
    }

    // Delete original unless -k or -c
    if (!options.keep && !options.stdout) {
      unlinkSync(inputFile);
    }

    // Clear tracking after successful completion
    currentOutputFile = null;
    return EXIT_SUCCESS;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`nxz: ${inputFile}: ${message}`);
    // Cleanup partial output
    if (outputFile && existsSync(outputFile)) {
      try {
        unlinkSync(outputFile);
      } catch {
        // Ignore cleanup errors
      }
    }
    currentOutputFile = null;
    return EXIT_ERROR;
  }
}

/**
 * Process a single file
 */
async function processFile(filename: string, options: CliOptions): Promise<number> {
  // Check file exists
  if (!existsSync(filename)) {
    warn(`nxz: ${filename}: No such file or directory`);
    return EXIT_ERROR;
  }

  // Check if it's a directory
  if (statSync(filename).isDirectory()) {
    warn(`nxz: ${filename}: Is a directory, skipping`);
    return EXIT_ERROR;
  }

  const mode = determineMode(options, filename);

  switch (mode) {
    case 'list':
      return listFile(filename, options);
    case 'compress':
      return compressFile(filename, options);
    case 'decompress':
      return decompressFile(filename, options);
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
