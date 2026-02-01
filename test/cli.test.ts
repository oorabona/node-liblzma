/**
 * Tests for nxz CLI tool
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isXZ, unxzSync, xzSync } from '../lib/lzma.js';

const NXZ_PATH = join(import.meta.dirname, '..', 'lib', 'cli', 'nxz.js');

/**
 * Run nxz CLI and return result
 */
function runNxz(
  args: string[],
  options?: { cwd?: string; input?: Buffer }
): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  try {
    const result = execFileSync('node', [NXZ_PATH, ...args], {
      cwd: options?.cwd,
      input: options?.input,
      encoding: 'buffer',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return {
      stdout: result.toString('utf-8'),
      stderr: '',
      exitCode: 0,
    };
  } catch (err: unknown) {
    const error = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: error.stdout?.toString('utf-8') ?? '',
      stderr: error.stderr?.toString('utf-8') ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

/**
 * Run nxz CLI and capture binary stdout
 */
function runNxzBinary(
  args: string[],
  options?: { cwd?: string; input?: Buffer }
): {
  stdout: Buffer;
  stderr: string;
  exitCode: number;
} {
  try {
    const result = execFileSync('node', [NXZ_PATH, ...args], {
      cwd: options?.cwd,
      input: options?.input,
      encoding: 'buffer',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return {
      stdout: result,
      stderr: '',
      exitCode: 0,
    };
  } catch (err: unknown) {
    const error = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: error.stdout ?? Buffer.alloc(0),
      stderr: error.stderr?.toString('utf-8') ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

describe('nxz CLI', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'nxz-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Help and Version', () => {
    it('should display help with --help', () => {
      // Arrange & Act
      const result = runNxz(['--help']);

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('nxz - Node.js XZ compression CLI');
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('--compress');
      expect(result.stdout).toContain('--decompress');
    });

    it('should display help with -h', () => {
      // Arrange & Act
      const result = runNxz(['-h']);

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('nxz - Node.js XZ compression CLI');
    });

    it('should display version with --version', () => {
      // Arrange & Act
      const result = runNxz(['--version']);

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/nxz \d+\.\d+\.\d+/);
      expect(result.stdout).toContain('liblzma');
      expect(result.stdout).toMatch(/Thread support: (yes|no)/);
    });

    it('should display version with -V', () => {
      // Arrange & Act
      const result = runNxz(['-V']);

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/nxz \d+\.\d+\.\d+/);
    });
  });

  describe('Compression', () => {
    describe('Given a text file', () => {
      describe('When compressing with default settings', () => {
        it('Then creates .xz file and deletes original', () => {
          // Arrange
          const inputPath = join(tempDir, 'test.txt');
          writeFileSync(inputPath, 'Hello World');

          // Act
          const result = runNxz(['test.txt'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(existsSync(join(tempDir, 'test.txt.xz'))).toBe(true);
          expect(existsSync(inputPath)).toBe(false);
        });
      });

      describe('When compressing with -k (keep)', () => {
        it('Then creates .xz file and keeps original', () => {
          // Arrange
          const inputPath = join(tempDir, 'test.txt');
          writeFileSync(inputPath, 'Hello World');

          // Act
          const result = runNxz(['-k', 'test.txt'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(existsSync(join(tempDir, 'test.txt.xz'))).toBe(true);
          expect(existsSync(inputPath)).toBe(true);
        });
      });

      describe('When compressing with preset', () => {
        it('Then uses specified compression level', () => {
          // Arrange
          const inputPath = join(tempDir, 'test.txt');
          const content = 'A'.repeat(1000);
          writeFileSync(inputPath, content);

          // Act
          const result = runNxz(['-k', '-9', 'test.txt'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(existsSync(join(tempDir, 'test.txt.xz'))).toBe(true);
        });
      });

      describe('When compressing with custom output (-o)', () => {
        it('Then creates file at specified path', () => {
          // Arrange
          const inputPath = join(tempDir, 'source.txt');
          const outputPath = join(tempDir, 'subdir', 'output.xz');
          writeFileSync(inputPath, 'Hello World');
          mkdirSync(join(tempDir, 'subdir'));

          // Act
          const result = runNxz(['-k', '-o', outputPath, 'source.txt'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(existsSync(outputPath)).toBe(true);
          expect(existsSync(inputPath)).toBe(true);
        });
      });

      describe('When compressing to stdout with -c', () => {
        it('Then writes compressed data to stdout and keeps original', () => {
          // Arrange
          const inputPath = join(tempDir, 'test.txt');
          writeFileSync(inputPath, 'Hello World');

          // Act
          const result = runNxzBinary(['-c', 'test.txt'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(isXZ(result.stdout)).toBe(true);
          expect(existsSync(inputPath)).toBe(true);
        });
      });
    });
  });

  describe('Decompression', () => {
    describe('Given an XZ compressed file', () => {
      describe('When decompressing with -d', () => {
        it('Then creates original file and deletes .xz', () => {
          // Arrange
          const originalContent = 'Hello World Decompression Test';
          const xzPath = join(tempDir, 'test.txt.xz');
          writeFileSync(xzPath, xzSync(Buffer.from(originalContent)));

          // Act
          const result = runNxz(['-d', 'test.txt.xz'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(existsSync(join(tempDir, 'test.txt'))).toBe(true);
          expect(existsSync(xzPath)).toBe(false);
          expect(readFileSync(join(tempDir, 'test.txt'), 'utf-8')).toBe(originalContent);
        });
      });

      describe('When auto-detecting mode from .xz extension', () => {
        it('Then decompresses without -d flag', () => {
          // Arrange
          const originalContent = 'Auto-detect test';
          const xzPath = join(tempDir, 'auto.txt.xz');
          writeFileSync(xzPath, xzSync(Buffer.from(originalContent)));

          // Act
          const result = runNxz(['auto.txt.xz'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(existsSync(join(tempDir, 'auto.txt'))).toBe(true);
          expect(readFileSync(join(tempDir, 'auto.txt'), 'utf-8')).toBe(originalContent);
        });
      });

      describe('When decompressing with custom output (-o)', () => {
        it('Then creates file at specified path', () => {
          // Arrange
          const originalContent = 'Custom output decompression test';
          const xzPath = join(tempDir, 'input.xz');
          const outputPath = join(tempDir, 'custom-output.txt');
          writeFileSync(xzPath, xzSync(Buffer.from(originalContent)));

          // Act
          const result = runNxz(['-d', '-o', outputPath, 'input.xz'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(existsSync(outputPath)).toBe(true);
          expect(readFileSync(outputPath, 'utf-8')).toBe(originalContent);
        });
      });

      describe('When decompressing to stdout with -dc', () => {
        it('Then writes decompressed data to stdout', () => {
          // Arrange
          const originalContent = 'Stdout decompression test';
          const xzPath = join(tempDir, 'stdout.txt.xz');
          writeFileSync(xzPath, xzSync(Buffer.from(originalContent)));

          // Act
          const result = runNxz(['-dc', 'stdout.txt.xz'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toBe(originalContent);
          expect(existsSync(xzPath)).toBe(true);
        });
      });
    });
  });

  describe('List', () => {
    describe('Given an XZ file', () => {
      describe('When listing with -l', () => {
        it('Then shows file information', () => {
          // Arrange
          const content = 'A'.repeat(1000);
          const xzPath = join(tempDir, 'info.txt.xz');
          writeFileSync(xzPath, xzSync(Buffer.from(content)));

          // Act
          const result = runNxz(['-l', 'info.txt.xz'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain('Strms');
          expect(result.stdout).toContain('Compressed');
          expect(result.stdout).toContain('Uncompressed');
          expect(result.stdout).toContain('info.txt.xz');
        });
      });

      describe('When listing with -lv (verbose)', () => {
        it('Then shows detailed file information', () => {
          // Arrange
          const content = 'B'.repeat(500);
          const xzPath = join(tempDir, 'verbose.txt.xz');
          writeFileSync(xzPath, xzSync(Buffer.from(content)));

          // Act
          const result = runNxz(['-lv', 'verbose.txt.xz'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain('File:');
          expect(result.stdout).toContain('Streams:');
          expect(result.stdout).toContain('Blocks:');
          expect(result.stdout).toContain('Memory needed:');
        });
      });
    });
  });

  describe('Error Handling', () => {
    describe('Given a non-existent file', () => {
      describe('When trying to compress', () => {
        it('Then fails with error message', () => {
          // Arrange & Act
          const result = runNxz(['nonexistent.txt'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain('No such file');
        });
      });
    });

    describe('Given a directory', () => {
      describe('When trying to compress', () => {
        it('Then skips with appropriate message', () => {
          // Arrange
          mkdirSync(join(tempDir, 'subdir'));

          // Act
          const result = runNxz(['subdir'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain('Is a directory, skipping');
        });
      });
    });

    describe('Given output file exists', () => {
      describe('When compressing without -f', () => {
        it('Then fails with error message', () => {
          // Arrange
          const inputPath = join(tempDir, 'exists.txt');
          const outputPath = join(tempDir, 'exists.txt.xz');
          writeFileSync(inputPath, 'content');
          writeFileSync(outputPath, 'existing');

          // Act
          const result = runNxz(['exists.txt'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain('already exists');
        });
      });

      describe('When compressing with -f (force)', () => {
        it('Then overwrites existing file', () => {
          // Arrange
          const inputPath = join(tempDir, 'force.txt');
          const outputPath = join(tempDir, 'force.txt.xz');
          writeFileSync(inputPath, 'new content');
          writeFileSync(outputPath, 'old');

          // Act
          const result = runNxz(['-f', '-k', 'force.txt'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(0);
          const decompressed = unxzSync(readFileSync(outputPath));
          expect(decompressed.toString()).toBe('new content');
        });
      });
    });

    describe('Given an invalid XZ file', () => {
      describe('When trying to decompress', () => {
        it('Then fails with format error', () => {
          // Arrange
          const fakePath = join(tempDir, 'fake.xz');
          writeFileSync(fakePath, 'not xz data');

          // Act
          const result = runNxz(['-d', 'fake.xz'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain('File format not recognized');
        });
      });
    });
  });

  describe('Stdin/Stdout', () => {
    describe('Given stdin input', () => {
      describe('When compressing from stdin', () => {
        it('Then writes compressed data to stdout', () => {
          // Arrange
          const input = Buffer.from('stdin test data');

          // Act
          const result = runNxzBinary(['-c'], { input });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(isXZ(result.stdout)).toBe(true);
          const decompressed = unxzSync(result.stdout);
          expect(decompressed.toString()).toBe('stdin test data');
        });
      });

      describe('When decompressing from stdin', () => {
        it('Then writes decompressed data to stdout', () => {
          // Arrange
          const original = 'decompress stdin test';
          const compressed = xzSync(Buffer.from(original));

          // Act
          const result = runNxz(['-d'], { input: compressed });

          // Assert
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toBe(original);
        });
      });
    });
  });

  describe('Quiet Mode', () => {
    describe('Given an error condition', () => {
      describe('When using -q (quiet) flag', () => {
        it('Then suppresses error messages to stderr', () => {
          // Arrange - non-existent file
          // Act
          const result = runNxz(['-q', 'nonexistent.txt'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toBe(''); // stderr should be empty with -q
        });

        it('Then suppresses format errors with -q', () => {
          // Arrange - invalid XZ file
          const fakePath = join(tempDir, 'fake.xz');
          writeFileSync(fakePath, 'not xz data');

          // Act
          const result = runNxz(['-q', '-d', 'fake.xz'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toBe(''); // stderr should be empty with -q
        });
      });

      describe('When NOT using -q flag', () => {
        it('Then shows error messages to stderr', () => {
          // Arrange - non-existent file
          // Act
          const result = runNxz(['nonexistent.txt'], { cwd: tempDir });

          // Assert
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain('No such file'); // stderr should have message
        });
      });
    });
  });

  describe('benchmark mode', () => {
    /** Run nxz and capture stderr even on success (runNxz drops stderr on exit 0). */
    function runBenchmark(args: string[], cwd: string) {
      const proc = spawnSync('node', [NXZ_PATH, ...args], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
        timeout: 30_000,
      });
      return { stdout: proc.stdout, stderr: proc.stderr, exitCode: proc.status ?? 1 };
    }

    it('should benchmark native vs WASM on a file', () => {
      const inputFile = join(tempDir, 'bench-input.txt');
      writeFileSync(inputFile, 'Benchmark test data. '.repeat(50));

      const result = runBenchmark(['--benchmark', inputFile], tempDir);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('Benchmark:');
      expect(result.stderr).toContain('Native');
      expect(result.stderr).toContain('WASM');
      expect(result.stderr).toContain('Compress time');
      expect(result.stderr).toContain('Decompress time');
      expect(result.stderr).toContain('Roundtrip OK');
      expect(result.stderr).toContain('ALL PASS');
      // Original file should not be deleted
      expect(existsSync(inputFile)).toBe(true);
    });

    it('should accept preset with benchmark', () => {
      const inputFile = join(tempDir, 'bench-preset.txt');
      writeFileSync(inputFile, 'Preset benchmark data. '.repeat(50));

      const result = runBenchmark(['-B', '-3', inputFile], tempDir);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('preset 3');
      expect(result.stderr).toContain('ALL PASS');
    });
  });
});
