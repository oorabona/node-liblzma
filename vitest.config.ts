import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Include TypeScript and JavaScript test files, but exclude utils files
    include: ['test/**/*.{ts,js,tsx,jsx}'],
    exclude: ['test/**/*.utils.{ts,js}'],

    // Increased timeout to prevent premature termination
    testTimeout: 10000,
    hookTimeout: 10000,

    // Retry failed tests once to handle intermittent race conditions
    retry: 1,

    // Run tests sequentially in single worker with isolation (Vitest 4 flat config)
    // Replaces old pool/poolOptions — resolves "Channel closed" errors on CI
    maxWorkers: 1,
    isolate: true,

    // Coverage configuration - V8 optimisé pour précision max
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,js}'],
      exclude: [
        'test/**/*',
        'node_modules/**/*',
        '**/*.d.ts',
        'lib/**/*.js',
        // CLI is tested via execFileSync (integration), not unit-testable for coverage
        'src/cli/**',
        // Emscripten auto-generated glue code — not meaningful to cover
        'src/wasm/liblzma.js',
        // Inline mode is a thin re-export with base64 WASM init — minimal logic
        'src/lzma.inline.ts',
      ],
      // Configurations V8 pour précision maximale
      cleanOnRerun: true,
      all: false, // N'inclut que les fichiers qui sont réellement chargés
      skipFull: true, // Plus rapide et plus précis
      // Nouvelle option Vitest 3.2+ pour améliorer la précision
      experimentalAstAwareRemapping: true,
      ignoreEmptyLines: true,
      // Pas de thresholds pour l'instant - focus sur la précision
    },

    // Allow tests to run in Node environment
    environment: 'node',

    // TypeScript support
    typecheck: {
      enabled: true,
    },
  },
});
