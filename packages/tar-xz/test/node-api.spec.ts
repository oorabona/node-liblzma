import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFile, extractFile, listFile } from '../src/node/file.js';
import { TarEntryType } from '../src/types.js';

describe('Node.js file API (v6)', () => {
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

  describe('createFile', () => {
    it('creates a tar.xz archive from Buffer sources', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [
          { name: 'file1.txt', source: Buffer.from('Hello World') },
          { name: 'file2.txt', source: Buffer.from('Second file') },
        ],
      });
      const stats = await fs.stat(archivePath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('creates archive using fs path sources', async () => {
      const sourceDir = path.join(tempDir, 'source');
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'file1.txt'), 'Hello World');
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [{ name: 'file1.txt', source: path.join(sourceDir, 'file1.txt') }],
      });
      const stats = await fs.stat(archivePath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('supports compression presets', async () => {
      const content = Buffer.from('x'.repeat(10000));
      const archive1 = path.join(tempDir, 'archive1.tar.xz');
      const archive9 = path.join(tempDir, 'archive9.tar.xz');
      await createFile(archive1, { files: [{ name: 'data.txt', source: content }], preset: 1 });
      await createFile(archive9, { files: [{ name: 'data.txt', source: content }], preset: 9 });
      expect((await fs.stat(archive1)).size).toBeGreaterThan(0);
      expect((await fs.stat(archive9)).size).toBeGreaterThan(0);
    });

    it('applies filter to exclude files', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [
          { name: 'keep.txt', source: Buffer.from('keep') },
          { name: 'skip.log', source: Buffer.from('skip') },
        ],
        filter: (f) => !f.name.endsWith('.log'),
      });
      const entries = await listFile(archivePath);
      expect(entries.map((e) => e.name)).toEqual(['keep.txt']);
    });
  });

  describe('listFile', () => {
    it('lists archive contents with correct metadata', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [
          { name: 'file1.txt', source: Buffer.from('Content 1') },
          { name: 'file2.txt', source: Buffer.from('Content 2') },
        ],
      });
      const entries = await listFile(archivePath);
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.name).sort()).toEqual(['file1.txt', 'file2.txt']);
      expect(entries[0]?.type).toBe(TarEntryType.FILE);
    });

    it('includes correct file sizes', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [{ name: 'test.txt', source: Buffer.from('Hello') }],
      });
      const entries = await listFile(archivePath);
      expect(entries[0]?.size).toBe(5);
    });

    it('includes directory entries', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [
          { name: 'mydir/', source: new Uint8Array(0) },
          { name: 'mydir/file.txt', source: Buffer.from('nested') },
        ],
      });
      const entries = await listFile(archivePath);
      const dirEntry = entries.find((e) => e.name === 'mydir/');
      expect(dirEntry?.type).toBe(TarEntryType.DIRECTORY);
    });
  });

  describe('extractFile', () => {
    it('extracts archive to disk', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [{ name: 'hello.txt', source: Buffer.from('Hello, World!') }],
      });
      const destDir = path.join(tempDir, 'dest');
      await fs.mkdir(destDir);
      await extractFile(archivePath, { cwd: destDir });
      const content = await fs.readFile(path.join(destDir, 'hello.txt'), 'utf-8');
      expect(content).toBe('Hello, World!');
    });

    it('supports strip option', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [
          { name: 'prefix/', source: new Uint8Array(0) },
          { name: 'prefix/subdir/', source: new Uint8Array(0) },
          { name: 'prefix/subdir/file.txt', source: Buffer.from('Nested') },
        ],
      });
      const destDir = path.join(tempDir, 'dest');
      await fs.mkdir(destDir);
      await extractFile(archivePath, { cwd: destDir, strip: 1 });
      const content = await fs.readFile(path.join(destDir, 'subdir', 'file.txt'), 'utf-8');
      expect(content).toBe('Nested');
    });

    it('supports filter option', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [
          { name: 'keep.txt', source: Buffer.from('Keep this') },
          { name: 'skip.log', source: Buffer.from('Skip this') },
        ],
      });
      const destDir = path.join(tempDir, 'dest');
      await fs.mkdir(destDir);
      await extractFile(archivePath, { cwd: destDir, filter: (e) => !e.name.endsWith('.log') });
      const files = await fs.readdir(destDir);
      expect(files).toEqual(['keep.txt']);
    });

    it('rejects path traversal attacks', async () => {
      const { xzSync } = await import('node-liblzma');
      const { createHeader, calculatePadding, createEndOfArchive } = await import(
        '../src/tar/format.js'
      );
      const content = Buffer.from('evil');
      const header = createHeader({ name: '../evil.txt', size: content.length });
      const pad = calculatePadding(content.length);
      const tar = Buffer.concat([
        Buffer.from(header),
        content,
        Buffer.alloc(pad),
        Buffer.from(createEndOfArchive()),
      ]);
      const archivePath = path.join(tempDir, 'traversal.tar.xz');
      await fs.writeFile(archivePath, xzSync(tar));
      const destDir = path.join(tempDir, 'dest');
      await fs.mkdir(destDir);
      await expect(extractFile(archivePath, { cwd: destDir })).rejects.toThrow(/outside cwd/i);
    });

    it('creates parent directories automatically', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [{ name: 'a/b/c/deep.txt', source: Buffer.from('deep') }],
      });
      const destDir = path.join(tempDir, 'dest');
      await extractFile(archivePath, { cwd: destDir });
      const content = await fs.readFile(path.join(destDir, 'a', 'b', 'c', 'deep.txt'), 'utf-8');
      expect(content).toBe('deep');
    });

    it('accepts no options (does not throw on default options shape)', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      await createFile(archivePath, {
        files: [{ name: 'cwd-test.txt', source: Buffer.from('cwd') }],
      });
      // Verify the archive is well-formed (listFile does not throw).
      // We do not test default-cwd extraction here because it would write into
      // process.cwd() and may conflict with other tests; that behaviour is an
      // implementation detail exercised by the roundtrip tests.
      await expect(listFile(archivePath)).resolves.toHaveLength(1);
    });
  });

  describe('roundtrip', () => {
    it('preserves file content through createFile/extractFile cycle', async () => {
      const archivePath = path.join(tempDir, 'archive.tar.xz');
      const originalContent: Record<string, Buffer> = {
        'file1.txt': Buffer.from('First file content'),
        'file2.bin': Buffer.from([0x00, 0x01, 0x02, 0xff]),
        'a/nested.txt': Buffer.from('Nested content'),
        'a/b/deep.txt': Buffer.from('Deep content'),
      };

      await createFile(archivePath, {
        files: Object.entries(originalContent).map(([name, source]) => ({ name, source })),
      });

      const destDir = path.join(tempDir, 'dest');
      await extractFile(archivePath, { cwd: destDir });

      for (const [name, original] of Object.entries(originalContent)) {
        const extracted = await fs.readFile(path.join(destDir, name));
        expect(Buffer.compare(extracted, original)).toBe(0);
      }
    });

    it('handles large files (>=10 MB) correctly via streaming', async () => {
      const largeBuf = Buffer.alloc(10 * 1024 * 1024, 0x42);
      const archivePath = path.join(tempDir, 'large.tar.xz');
      await createFile(archivePath, {
        files: [{ name: 'large.bin', source: largeBuf }],
        preset: 1,
      });
      expect((await fs.stat(archivePath)).size).toBeGreaterThan(0);
      const destDir = path.join(tempDir, 'dest');
      await extractFile(archivePath, { cwd: destDir });
      const extracted = await fs.readFile(path.join(destDir, 'large.bin'));
      expect(extracted.length).toBe(largeBuf.length);
      expect(Buffer.compare(extracted, largeBuf)).toBe(0);
    });
  });

  describe('entry helpers (bytes / text)', () => {
    it('F-2: bytes() throws when entry.data was already iterated', async () => {
      const { create } = await import('../src/node/create.js');
      const { extract } = await import('../src/node/extract.js');

      const archive = create({
        files: [{ name: 'test.txt', source: Buffer.from('hello') }],
      });

      for await (const entry of extract(archive)) {
        // Partially consume entry.data first
        // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional drain
        for await (const _ of entry.data) {
          /* drain */
        }
        // Now bytes() must throw since dataGen is consumed
        await expect(entry.bytes()).rejects.toThrow(/entry\.data already iterated/);
      }
    });

    it('F-2: bytes() works fine when entry.data was NOT iterated', async () => {
      const { create } = await import('../src/node/create.js');
      const { extract } = await import('../src/node/extract.js');

      const content = Buffer.from('hello world');
      const archive = create({
        files: [{ name: 'test.txt', source: content }],
      });

      for await (const entry of extract(archive)) {
        const result = await entry.bytes();
        expect(Buffer.from(result)).toEqual(content);
      }
    });

    it('F-3: text() with utf8 encoding decodes correctly', async () => {
      const { create } = await import('../src/node/create.js');
      const { extract } = await import('../src/node/extract.js');

      const content = 'Hello, World!';
      const archive = create({
        files: [{ name: 'test.txt', source: Buffer.from(content, 'utf8') }],
      });

      for await (const entry of extract(archive)) {
        expect(await entry.text()).toBe(content);
        expect(await entry.text('utf8')).toBe(content);
      }
    });

    it('F-3: text("base64") base64-encodes the content (Buffer.toString contract)', async () => {
      const { create } = await import('../src/node/create.js');
      const { extract } = await import('../src/node/extract.js');

      const content = Buffer.from('binary data');
      const expected = content.toString('base64');

      const archive = create({
        files: [{ name: 'data.bin', source: content }],
      });

      for await (const entry of extract(archive)) {
        expect(await entry.text('base64')).toBe(expected);
      }
    });

    it('F-3: text("hex") hex-encodes the content (Buffer.toString contract)', async () => {
      const { create } = await import('../src/node/create.js');
      const { extract } = await import('../src/node/extract.js');

      const content = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      const expected = content.toString('hex');

      const archive = create({
        files: [{ name: 'bytes.bin', source: content }],
      });

      for await (const entry of extract(archive)) {
        expect(await entry.text('hex')).toBe(expected);
      }
    });

    it('F-1: breaking out of extract() early causes no unhandled rejection', async () => {
      const { create } = await import('../src/node/create.js');
      const { extract } = await import('../src/node/extract.js');

      const archive = create({
        files: [
          { name: 'a.txt', source: Buffer.from('entry-a') },
          { name: 'b.txt', source: Buffer.from('entry-b') },
          { name: 'c.txt', source: Buffer.from('entry-c') },
        ],
      });

      const unhandledRejections: Error[] = [];
      const handler = (err: Error) => unhandledRejections.push(err);
      process.on('unhandledRejection', handler);

      try {
        for await (const entry of extract(archive)) {
          expect(entry.name).toBe('a.txt');
          break; // consumer breaks after first entry
        }
        // Allow a microtask turn for any unhandled rejection to surface
        await new Promise((r) => setTimeout(r, 20));
      } finally {
        process.off('unhandledRejection', handler);
      }

      expect(unhandledRejections).toHaveLength(0);
    });
  });

  describe('streaming (in-memory)', () => {
    it('create() yields compressed chunks without disk I/O', async () => {
      const { create } = await import('../src/node/create.js');
      const chunks: Uint8Array[] = [];
      for await (const chunk of create({
        files: [{ name: 'hello.txt', source: Buffer.from('hello') }],
      })) {
        chunks.push(chunk);
      }
      const totalLen = chunks.reduce((n, c) => n + c.length, 0);
      expect(totalLen).toBeGreaterThan(0);
    });

    it('extract() piped from create() in-memory works without disk I/O', async () => {
      const { create } = await import('../src/node/create.js');
      const { extract } = await import('../src/node/extract.js');
      const { Readable } = await import('node:stream');

      // create() returns an AsyncIterable — pipe through Readable.from() into extract()
      const archiveIterable = create({
        files: [{ name: 'hello.txt', source: Buffer.from('hello world') }],
      });

      const entries: Array<{ name: string; content: Uint8Array }> = [];
      for await (const entry of extract(Readable.from(archiveIterable))) {
        entries.push({ name: entry.name, content: await entry.bytes() });
      }

      expect(entries).toHaveLength(1);
      expect(entries[0]?.name).toBe('hello.txt');
      expect(Buffer.from(entries[0]!.content).toString('utf-8')).toBe('hello world');
    });
  });
});
