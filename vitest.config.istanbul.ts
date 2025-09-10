import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Include TypeScript and JavaScript test files, but exclude utils files
    include: ['test/**/*.{ts,js,tsx,jsx}'],
    exclude: ['test/**/*.utils.{ts,js}'],

    // Timeout for tests (similar to Mocha config)
    testTimeout: 5000,

    // Coverage configuration with Istanbul
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,js}', 'lib/**/*.js'],
      exclude: ['test/**/*', 'node_modules/**/*', '**/*.d.ts'],
      reportsDirectory: './coverage-istanbul',
    },

    // Allow tests to run in Node environment
    environment: 'node',

    // TypeScript support
    typecheck: {
      enabled: true,
    },
  },
});
