import { defineConfig } from '@playwright/test';
const baseURL = process.env.KIMO_E2E_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  projects:
    process.env.KIMO_MATRIX === '1'
      ? [
          {
            name: 'chrome',
            use: { browserName: 'chromium', channel: 'chrome' },
          },
          { name: 'edge', use: { browserName: 'chromium', channel: 'msedge' } },
          { name: 'firefox', use: { browserName: 'firefox' } },
          { name: 'webkit', use: { browserName: 'webkit' } },
        ]
      : [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command:
        process.env.KIMO_E2E_PRODUCTION === '1'
          ? `pnpm --filter @kimo/web exec next start --port ${new URL(baseURL).port || '3000'}`
          : 'pnpm dev',
      url: baseURL + '/',
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
