/**
 * Block 6 Tests — Conditional Exports & Entry Points
 * Tests: SC-07, SC-08, SC-09, SC-09b
 */

import { describe, expect, it } from 'vitest';

describe('WASM Exports (Block 6)', () => {
  describe('SC-07/SC-08: Browser entry point', () => {
    it('should export high-level buffer API', async () => {
      const browser = await import('../../src/lzma.browser.js');
      expect(browser.xzAsync).toBeTypeOf('function');
      expect(browser.xz).toBeTypeOf('function');
      expect(browser.xzSync).toBeTypeOf('function');
      expect(browser.unxzAsync).toBeTypeOf('function');
      expect(browser.unxz).toBeTypeOf('function');
      expect(browser.unxzSync).toBeTypeOf('function');
    });

    it('should export streaming API', async () => {
      const browser = await import('../../src/lzma.browser.js');
      expect(browser.createXz).toBeTypeOf('function');
      expect(browser.createUnxz).toBeTypeOf('function');
    });

    it('should export utility functions', async () => {
      const browser = await import('../../src/lzma.browser.js');
      expect(browser.isXZ).toBeTypeOf('function');
      expect(browser.versionString).toBeTypeOf('function');
      expect(browser.versionNumber).toBeTypeOf('function');
      expect(browser.easyEncoderMemusage).toBeTypeOf('function');
      expect(browser.easyDecoderMemusage).toBeTypeOf('function');
      expect(browser.parseFileIndex).toBeTypeOf('function');
    });

    it('should export module initialization', async () => {
      const browser = await import('../../src/lzma.browser.js');
      expect(browser.initModule).toBeTypeOf('function');
      expect(browser.getModule).toBeTypeOf('function');
      expect(browser.resetModule).toBeTypeOf('function');
    });

    it('should export constants', async () => {
      const browser = await import('../../src/lzma.browser.js');
      expect(browser.LZMA_OK).toBe(0);
      expect(browser.LZMA_STREAM_END).toBe(1);
      expect(browser.LZMA_CHECK_CRC64).toBeDefined();
    });

    it('should export error types', async () => {
      const browser = await import('../../src/lzma.browser.js');
      expect(browser.LZMAError).toBeTypeOf('function');
    });

    it('should NOT export Node.js-specific APIs', async () => {
      const browser = await import('../../src/lzma.browser.js');
      // Node Transform streams and filesystem operations should not exist
      expect((browser as Record<string, unknown>).Xz).toBeUndefined();
      expect((browser as Record<string, unknown>).Unxz).toBeUndefined();
      expect((browser as Record<string, unknown>).XzStream).toBeUndefined();
      expect((browser as Record<string, unknown>).xzFile).toBeUndefined();
      expect((browser as Record<string, unknown>).unxzFile).toBeUndefined();
    });
  });

  describe('SC-08: Node entry point', () => {
    it('should export native API from main entry', async () => {
      const node = await import('../../src/lzma.js');
      expect(node.xzAsync).toBeTypeOf('function');
      expect(node.unxzAsync).toBeTypeOf('function');
      expect(node.createXz).toBeTypeOf('function');
      expect(node.createUnxz).toBeTypeOf('function');
      expect(node.isXZ).toBeTypeOf('function');
      expect(node.versionString).toBeTypeOf('function');
    });

    it('should export Node.js-specific APIs', async () => {
      const node = await import('../../src/lzma.js');
      expect(node.Xz).toBeTypeOf('function');
      expect(node.Unxz).toBeTypeOf('function');
    });
  });

  describe('SC-09: Explicit WASM import', () => {
    it('should export WASM API from /wasm subpath', async () => {
      const wasm = await import('../../src/wasm/index.js');
      expect(wasm.xzAsync).toBeTypeOf('function');
      expect(wasm.unxzAsync).toBeTypeOf('function');
      expect(wasm.createXz).toBeTypeOf('function');
      expect(wasm.createUnxz).toBeTypeOf('function');
      expect(wasm.isXZ).toBeTypeOf('function');
      expect(wasm.initModule).toBeTypeOf('function');
    });
  });

  describe('SC-09b: Inline WASM import', () => {
    it('should export inline module with ensureInlineInit', async () => {
      const inline = await import('../../src/lzma.inline.js');
      expect(inline.ensureInlineInit).toBeTypeOf('function');
      expect(inline.xzAsync).toBeTypeOf('function');
      expect(inline.unxzAsync).toBeTypeOf('function');
      expect(inline.createXz).toBeTypeOf('function');
      expect(inline.initModule).toBeTypeOf('function');
    });
  });

  describe('SC-10: WASM module loading failure', () => {
    it('should throw LZMAError when module loader fails', async () => {
      const { initModule, resetModule } = await import('../../src/wasm/bindings.js');
      const { LZMAError } = await import('../../src/errors.js');

      // Reset module state so we can test init failure
      resetModule();

      try {
        await initModule(async () => {
          throw new Error('WebAssembly not supported');
        });
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(LZMAError);
        expect((err as Error).message).toContain('Failed to load WASM module');
        expect((err as Error).message).toContain('WebAssembly not supported');
      }

      // Re-initialize with working loader for other tests
      resetModule();
    });
  });

  describe('package.json exports', () => {
    it('should have browser condition in main export', async () => {
      const { readFile } = await import('node:fs/promises');
      const pkgJson = JSON.parse(
        await readFile(new URL('../../package.json', import.meta.url), 'utf-8')
      );
      const mainExport = pkgJson.exports['.'];
      expect(mainExport.browser).toBeDefined();
      expect(mainExport.browser.import).toContain('lzma.browser');
      expect(mainExport.import).toContain('lzma.js');
    });

    it('should have /wasm subpath export', async () => {
      const { readFile } = await import('node:fs/promises');
      const pkgJson = JSON.parse(
        await readFile(new URL('../../package.json', import.meta.url), 'utf-8')
      );
      expect(pkgJson.exports['./wasm']).toBeDefined();
      expect(pkgJson.exports['./wasm'].import).toContain('wasm/index');
    });

    it('should have /inline subpath export', async () => {
      const { readFile } = await import('node:fs/promises');
      const pkgJson = JSON.parse(
        await readFile(new URL('../../package.json', import.meta.url), 'utf-8')
      );
      expect(pkgJson.exports['./inline']).toBeDefined();
      expect(pkgJson.exports['./inline'].import).toContain('lzma.inline');
    });
  });
});
