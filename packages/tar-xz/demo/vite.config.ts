import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  root: resolve(__dirname),
  // Use relative base in dev, absolute for GitHub Pages in prod
  base: command === 'serve' ? '/' : '/node-liblzma/tar-xz/',
  build: {
    outDir: resolve(__dirname, '../../../docs-site/tar-xz'),
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      // /wasm subpath FIRST (more specific than the bare package alias) — otherwise
      // 'node-liblzma' replacement runs first and produces 'lib/lzma.browser.js/wasm'
      // which is not a valid path. Subpath order matters here.
      {
        find: 'node-liblzma/wasm',
        replacement: resolve(__dirname, '../../../lib/wasm/index.js'),
      },
      {
        find: 'node-liblzma',
        replacement: resolve(__dirname, '../../../lib/lzma.browser.js'),
      },
    ],
  },
  optimizeDeps: {
    // Exclude node-liblzma from pre-bundling so Vite serves the WASM file
    // directly from the filesystem (same approach as examples/browser)
    exclude: ['node-liblzma'],
  },
}));
