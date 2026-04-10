import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      // Point to the browser entry directly (alias bypasses package.json export conditions)
      'node-liblzma': resolve(__dirname, '../../lib/lzma.browser.js'),
    },
  },
  base: '/node-liblzma/demo/',
  build: {
    outDir: resolve(__dirname, '../../docs-site/demo'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: false,
  },
});
