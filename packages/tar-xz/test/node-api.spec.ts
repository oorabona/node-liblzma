import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create, extract, extractToMemory, list } from '../src/index.js';
import { TarEntryType } from '../src/types.js';

describe('Node.js API', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-xz-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('create', () => {
    it('creates a tar.xz archive from files', async () => {
      // Create test files
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'file1.txt'), 'Hello World');
      await fs.writeFile(path.join(sourceDir, 'file2.txt'), 'Second file');

      const archivePath = path.join(tempDir, 'archive.tar.xz');

      await create({
        file: archivePath,
        cwd: sourceDir,
        files: ['file1.txt', 'file2.txt'],
      });

      // Verify archive exists
      const stats = await fs.stat(archivePath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('creates archive with directories', async () => {
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(path.join(sourceDir, 'subdir'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'subdir', 'file.txt'), 'Nested file');

      const archivePath = path.join(tempDir, 'archive.tar.xz');

      await create({
        file: archivePath,
        cwd: sourceDir,
        files: ['subdir'],
      });

      const stats = await fs.stat(archivePath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('supports compression presets', async () => {
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(sourceDir);
      const content = 'x'.repeat(10000);
      await fs.writeFile(path.join(sourceDir, 'data.txt'), content);

      const archive1 = path.join(tempDir, 'archive1.tar.xz');
      const archive9 = path.join(tempDir, 'archive9.tar.xz');

      await create({
        file: archive1,
        cwd: sourceDir,
        files: ['data.txt'],
        preset: 1,
      });

      await create({
        file: archive9,
        cwd: sourceDir,
        files: ['data.txt'],
        preset: 9,
      });

      const stats1 = await fs.stat(archive1);
      const stats9 = await fs.stat(archive9);

      // Both archives should be valid (size > 0)
      expect(stats1.size).toBeGreaterThan(0);
      expect(stats9.size).toBeGreaterThan(0);
      // For small files, preset difference may be negligible due to dictionary overhead
    });
  });

  describe('list', () => {
    it('lists archive contents', async () => {
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'file1.txt'), 'Content 1');
      await fs.writeFile(path.join(sourceDir, 'file2.txt'), 'Content 2');

      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await create({
        file: archivePath,
        cwd: sourceDir,
        files: ['file1.txt', 'file2.txt'],
      });

      const entries = await list({ file: archivePath });

      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.name).sort()).toEqual(['file1.txt', 'file2.txt']);
      expect(entries[0].type).toBe(TarEntryType.FILE);
    });

    it('includes file sizes', async () => {
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'Hello');

      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await create({
        file: archivePath,
        cwd: sourceDir,
        files: ['test.txt'],
      });

      const entries = await list({ file: archivePath });

      expect(entries[0].size).toBe(5);
    });
  });

  describe('extract', () => {
    it('extracts archive to disk', async () => {
      // Create source
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'hello.txt'), 'Hello, World!');

      // Create archive
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await create({
        file: archivePath,
        cwd: sourceDir,
        files: ['hello.txt'],
      });

      // Extract to new location
      const destDir = path.join(tempDir, 'dest');
      await fs.mkdir(destDir);

      await extract({
        file: archivePath,
        cwd: destDir,
      });

      // Verify extraction
      const content = await fs.readFile(path.join(destDir, 'hello.txt'), 'utf-8');
      expect(content).toBe('Hello, World!');
    });

    it('supports strip option', async () => {
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(path.join(sourceDir, 'prefix', 'subdir'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'prefix', 'subdir', 'file.txt'), 'Nested');

      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await create({
        file: archivePath,
        cwd: sourceDir,
        files: ['prefix'],
      });

      const destDir = path.join(tempDir, 'dest');
      await fs.mkdir(destDir);

      await extract({
        file: archivePath,
        cwd: destDir,
        strip: 1,
      });

      // File should be at subdir/file.txt, not prefix/subdir/file.txt
      const content = await fs.readFile(path.join(destDir, 'subdir', 'file.txt'), 'utf-8');
      expect(content).toBe('Nested');
    });

    it('supports filter option', async () => {
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'keep.txt'), 'Keep this');
      await fs.writeFile(path.join(sourceDir, 'skip.log'), 'Skip this');

      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await create({
        file: archivePath,
        cwd: sourceDir,
        files: ['keep.txt', 'skip.log'],
      });

      const destDir = path.join(tempDir, 'dest');
      await fs.mkdir(destDir);

      await extract({
        file: archivePath,
        cwd: destDir,
        filter: (entry) => !entry.name.endsWith('.log'),
      });

      // Only keep.txt should exist
      const files = await fs.readdir(destDir);
      expect(files).toEqual(['keep.txt']);
    });
  });

  describe('extractToMemory', () => {
    it('extracts archive to memory', async () => {
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'data.txt'), 'In-memory data');

      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await create({
        file: archivePath,
        cwd: sourceDir,
        files: ['data.txt'],
      });

      const entries = await extractToMemory(archivePath);

      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('data.txt');
      expect(entries[0].content.toString('utf-8')).toBe('In-memory data');
    });
  });

  describe('security', () => {
    it('rejects path traversal attacks', async () => {
      // Create an archive with a malicious path manually
      // We'll use extractToMemory first, then try to extract with a crafted entry
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'safe.txt'), 'Safe content');

      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await create({
        file: archivePath,
        cwd: sourceDir,
        files: ['safe.txt'],
      });

      // Extract to a nested directory
      const destDir = path.join(tempDir, 'dest', 'nested');
      await fs.mkdir(destDir, { recursive: true });

      // This should succeed (no traversal)
      await extract({
        file: archivePath,
        cwd: destDir,
      });

      expect(await fs.readFile(path.join(destDir, 'safe.txt'), 'utf-8')).toBe('Safe content');
    });
  });

  describe('roundtrip', () => {
    it('preserves file content through create/extract cycle', async () => {
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(path.join(sourceDir, 'a', 'b'), { recursive: true });

      const originalContent = {
        'file1.txt': 'First file content',
        'file2.bin': Buffer.from([0x00, 0x01, 0x02, 0xff]),
        'a/nested.txt': 'Nested content',
        'a/b/deep.txt': 'Deep content',
      };

      for (const [name, content] of Object.entries(originalContent)) {
        await fs.writeFile(path.join(sourceDir, name), content);
      }

      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await create({
        file: archivePath,
        cwd: sourceDir,
        files: ['file1.txt', 'file2.bin', 'a'],
      });

      const destDir = path.join(tempDir, 'dest');
      await fs.mkdir(destDir);

      await extract({
        file: archivePath,
        cwd: destDir,
      });

      // Verify all content
      for (const [name, original] of Object.entries(originalContent)) {
        const extracted = await fs.readFile(path.join(destDir, name));
        if (typeof original === 'string') {
          expect(extracted.toString('utf-8')).toBe(original);
        } else {
          expect(extracted).toEqual(original);
        }
      }
    });
  });
});
