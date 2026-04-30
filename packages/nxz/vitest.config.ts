import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // src/nxz.ts is the CLI entrypoint exercised via execFileSync from cli.test.ts —
      // vitest workers don't instrument the subprocess, so including it here would
      // always report 0% on codecov. Track only memlimit.ts (the importable helper
      // directly imported by parse-memlimit.test.ts).
      include: ['src/memlimit.ts'],
    },
  },
});
