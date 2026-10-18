import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.mjs', 'conformance/**/*.test.ts'],
    exclude: ['conformance/django/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    // Private GitHub Linux runners have two CPUs; Vitest's CPU-minus-one default serializes this IO-heavy suite.
    maxWorkers: process.env.GITHUB_ACTIONS === 'true' ? 2 : undefined,
  },
});
