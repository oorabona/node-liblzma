import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use threads pool (default) for fast parallel execution.
    // Memory-shape tests that require --expose-gc have their own config:
    // vitest.memory.config.ts (pool: 'forks') — run via pnpm test:memory.
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
