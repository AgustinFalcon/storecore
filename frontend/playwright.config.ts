import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4300',
    browserName: 'chromium',
  },
  webServer: {
    command: 'npx ng serve --host 127.0.0.1 --port 4300',
    port: 4300,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
