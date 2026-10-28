import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@/': fileURLToPath(new URL('./apps/web/src/', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'contracts',
          include: ['packages/**/*.test.{ts,mjs}'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'api',
          include: ['apps/api/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          include: ['apps/**/*.test.{ts,tsx}'],
          exclude: ['apps/api/**', '**/node_modules/**'],
          environment: 'jsdom',
        },
      },
    ],
    testTimeout: 15000,
    maxWorkers: 2,
  },
});
