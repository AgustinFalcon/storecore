import { defineConfig } from '@playwright/test';

const port = Number(process.env.STORECORE_A11Y_PORT ?? 4300);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
  },
  webServer: {
    command: `npx ng serve --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
