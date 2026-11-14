import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './e2e-psd-real', fullyParallel: false, workers: 1, retries: 0,
  globalSetup: './e2e-psd-real/route-auth.global-setup.ts',
  timeout: 60_000, expect: { timeout: 15_000 },
  // The runner publishes allowlisted metadata as HTML/JUnit. Raw failures can
  // contain credentials from browser actions and belong in ephemeral scratch.
  reporter: [['list'], ['json', { outputFile: process.env['STORECORE_PSD_RAW_REPORT'] ?? join(tmpdir(), `storecore-psd-${randomUUID()}.json`) }]],
  outputDir: 'psd-real-results/tests',
  use: { baseURL: 'https://localhost:4301', browserName: 'chromium', ignoreHTTPSErrors: true,
    trace: 'off', screenshot: 'off',
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] } },
});
