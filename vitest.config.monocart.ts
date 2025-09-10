import { withMonocartProvider } from '@oorabona/vitest-monocart-coverage';
import { defineConfig } from 'vitest/config';

export default withMonocartProvider(
  defineConfig({
    test: {
      // Include TypeScript and JavaScript test files, but exclude utils files
      include: ['test/**/*.{ts,js,tsx,jsx}'],
      exclude: ['test/**/*.utils.{ts,js}'],

      // Timeout for tests (similar to Mocha config)
      testTimeout: 5000,

      // Coverage configuration with Monocart
      coverage: {
        enabled: true,
        reporter: ['console-details', 'json', 'html', 'lcov'],
        include: ['src/**/*.{ts,js}'],
        exclude: ['test/**/*', 'node_modules/**/*', '**/*.d.ts', 'lib/**/*.js'],
        // Configurations V8 pour précision maximale
        cleanOnRerun: true,
        all: false, // N'inclut que les fichiers qui sont réellement chargés
        skipFull: true, // Plus rapide et plus précis
        // Nouvelle option Vitest 3.2+ pour améliorer la précision
        experimentalAstAwareRemapping: true,
        ignoreEmptyLines: true,

        // Options Monocart spécifiques
        clean: true,
      },

      // Allow tests to run in Node environment
      environment: 'node',

      // TypeScript support
      typecheck: {
        enabled: true,
      },
    },
  }),
  {
    reports: ['html', 'console-details', 'lcov'],
  }
);
