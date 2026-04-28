import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use forks pool so that --expose-gc (required by memory-shape tests) is
    // available. Memory-shape tests feature-detect gc at runtime and skip if
    // missing, so this flag is non-breaking on CI runners that do not pass it.
    // The forks pool also gives each test file a clean V8 heap.
    //
    // Note: Vitest 4 moved pool-level execArgv to top-level test.execArgv.
    // The previous poolOptions.forks.execArgv is now just test.execArgv.
    pool: 'forks',
    execArgv: ['--expose-gc'],
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
