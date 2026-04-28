import { defineConfig } from 'vitest/config';

/**
 * Separate Vitest config for memory-shape tests only.
 *
 * These tests require --expose-gc (available via Node forks pool) and are
 * intentionally isolated here so the default vitest.config.ts can use the
 * faster threads pool for the rest of the suite.
 *
 * Usage: pnpm test:memory
 */
export default defineConfig({
  test: {
    pool: 'forks',
    execArgv: ['--expose-gc'],
    include: ['test/memory-shape.spec.ts'],
  },
});
