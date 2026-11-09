import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'apps/*/renderer/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
  },
});
