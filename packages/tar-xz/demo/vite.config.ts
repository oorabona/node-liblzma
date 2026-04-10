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
    alias: {
      // Point to the browser entry directly (alias bypasses package.json export conditions)
      'node-liblzma': resolve(__dirname, '../../../lib/lzma.browser.js'),
    },
  },
  optimizeDeps: {
    // Exclude node-liblzma from pre-bundling so Vite serves the WASM file
    // directly from the filesystem (same approach as examples/browser)
    exclude: ['node-liblzma'],
  },
}));
