import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-recovery-real', workers: 1, retries: 0, timeout: 45_000,
  use: { baseURL: 'https://localhost:4303', ignoreHTTPSErrors: true, browserName: 'chromium', trace: 'off', screenshot: 'off', video: 'off' },
});
