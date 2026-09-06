import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig uses jsx:"preserve" for Next; vitest/esbuild needs an active runtime.
  esbuild: { jsx: 'automatic' },
  test: {
    // UI tests are .test.tsx and opt into jsdom via a per-file directive.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup-ui.ts'],
  },
});
