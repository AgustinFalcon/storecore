import { defineConfig } from '@playwright/test';
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const origin = process.env['STORECORE_UA_REAL_ORIGIN'];
if (!origin || process.env['STORECORE_UA_REAL_ISOLATED'] !== 'true') {
  throw new Error('UA RealLocal requires an explicitly isolated, seeded HTTPS environment.');
}
const url = new URL(origin);
if (url.protocol !== 'https:' || url.hostname !== '127.0.0.1' || url.origin !== origin || url.username || url.password) {
  throw new Error('UA RealLocal accepts one exact HTTPS 127.0.0.1 origin, with no credentials or path.');
}

export default defineConfig({
  testDir: './ua-real-local',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: origin, browserName: 'chromium', ignoreHTTPSErrors: true, trace: 'off' },
});
