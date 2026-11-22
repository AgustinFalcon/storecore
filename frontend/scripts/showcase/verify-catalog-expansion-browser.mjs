import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.STORECORE_PRESENTATION_FRONTEND ?? 'http://127.0.0.1:4200';
const output = resolve(process.env.STORECORE_PRESENTATION_BROWSER_RESULTS ?? 'ua-real-results/presentation-persistent/browser');
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ baseURL: baseUrl, viewport: { width: 1440, height: 1000 } });
  const failed = [];
  page.on('response', (response) => {
    const anonymousSessionProbe = response.status() === 401
      && (response.url().endsWith('/api/v1/customer/me') || response.url().endsWith('/api/v1/internal/me'));
    if (response.url().startsWith(`${baseUrl}/api/`) && response.status() >= 400 && !anonymousSessionProbe) {
      failed.push(`${response.status()} ${response.url()}`);
    }
  });

  const catalogApi = await page.request.get('/api/v1/catalog?page=0&size=48');
  assert.equal(catalogApi.status(), 200);
  const catalogEnvelope = await catalogApi.json();
  const catalogBody = catalogEnvelope.data ?? catalogEnvelope;
  assert.equal(catalogBody.total, 152);

  await page.goto('/catalog', { waitUntil: 'domcontentloaded' });
  await page.locator('sc-product-tile').first().waitFor({ state: 'visible' });
  const renderedTiles = await page.locator('sc-product-tile').count();
  assert.ok(renderedTiles >= 12);

  await page.goto('/catalog/SHOW-PLUS-001', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Lijadora orbital 300W/i }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.sc-pdp__thumbs img').count(), 4);
  assert.equal(await page.locator('.sc-zoom img').count(), 1);
  await page.waitForFunction(() => [...document.querySelectorAll('.sc-pdp__gallery img')].every((image) => image.complete && image.naturalWidth > 0));
  assert.ok(await page.locator('.sc-pdp__gallery img').evaluateAll((images) => images.every((image) => image.naturalWidth >= 600)));
  assert.match(await page.locator('body').innerText(), /stock|disponible/i);
  await page.screenshot({ path: resolve(output, 'catalog-expansion-product.png'), fullPage: true });

  assert.deepEqual(failed, []);
  console.log(JSON.stringify({ catalogTotal: catalogBody.total, renderedTiles, product: 'SHOW-PLUS-001', thumbnails: 4 }, null, 2));
} finally {
  await browser.close();
}
