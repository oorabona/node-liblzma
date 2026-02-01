import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      // Point to the built library so Vite resolves the browser condition
      'node-liblzma': resolve(__dirname, '../../'),
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
