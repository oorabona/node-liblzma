import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/browser/**', // Browser APIs use WASM, not testable in Node
        'src/index.ts', // Barrel re-export
        'src/index.browser.ts', // Browser entry point
        'src/node/index.ts', // Barrel re-export
        'src/tar/index.ts', // Barrel re-export
      ],
    },
  },
});
