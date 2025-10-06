import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Include TypeScript and JavaScript test files, but exclude utils files
    include: ['test/**/*.{ts,js,tsx,jsx}'],
    exclude: ['test/**/*.utils.{ts,js}'],

    // Timeout for tests (similar to Mocha config)
    testTimeout: 5000,

    // Use forks instead of threads on macOS to avoid IPC channel issues
    pool: process.platform === 'darwin' ? 'forks' : 'threads',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Coverage configuration - V8 optimisé pour précision max
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,js}'],
      exclude: ['test/**/*', 'node_modules/**/*', '**/*.d.ts', 'lib/**/*.js'],
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
