import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'sc26-customer-administration.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  outputDir: './artifacts/sc26/results',
  reporter: [['list'], ['json', { outputFile: 'artifacts/sc26/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4390', browserName: 'chromium', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: process.env['STORECORE_DEMO_EXTERNAL_SERVER'] ? undefined : { command: 'node demo-e2e/serve.mjs', cwd: '..', port: 4390, reuseExistingServer: false, timeout: 30_000 },
});
