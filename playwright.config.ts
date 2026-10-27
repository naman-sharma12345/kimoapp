import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3000',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000/dev/tokens',
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm mock',
      url: 'http://127.0.0.1:8787/health',
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
