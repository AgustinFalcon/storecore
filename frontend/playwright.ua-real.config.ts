import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-real',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'ua-real-results/report', open: 'never' }]],
  outputDir: 'ua-real-results/tests',
  use: {
    baseURL: 'https://localhost:4301',
    browserName: 'chromium',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
