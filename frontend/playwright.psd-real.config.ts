import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-psd-real', fullyParallel: false, workers: 1, retries: 0,
  timeout: 60_000, expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'psd-real-results/report', open: 'never' }]],
  outputDir: 'psd-real-results/tests',
  use: { baseURL: 'https://localhost:4301', browserName: 'chromium', ignoreHTTPSErrors: true,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] } },
});
