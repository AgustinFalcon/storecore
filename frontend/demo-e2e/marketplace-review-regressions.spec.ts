import { expect, test, type Page } from '@playwright/test';
const cta = (page: Page, id: string) => page.locator(`[data-cta="${id}"]`);
async function admin(page: Page) {
  await page.goto('/demo/login'); await page.getByLabel('Contraseña', { exact: true }).fill('demo');
  await cta(page, 'login-submit').click(); await cta(page, 'login-admin').click();
  await page.goto('/demo/user/mercadolibre'); await cta(page, 'marketplace-authorize').click();
}
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => { const url = new URL(route.request().url()); expect(url.hostname).toBe('127.0.0.1'); expect(url.pathname.startsWith('/api')).toBe(false); return route.continue(); });
});
test('repeat stays disabled until a real sale and then preserves the complete snapshot', async ({ page }) => {
  await admin(page); await cta(page, 'ml-tab-stock').click();
  const repeat = page.locator('[data-cta^="marketplace-variant-sale-"]').first();
  await expect(repeat).toBeDisabled();
  await page.locator('[data-cta^="marketplace-variant-new-sale-"]').first().click(); await expect(repeat).toBeEnabled();
  const before = await page.evaluate(() => localStorage.getItem('storecore.commercial-demo.v1'));
  await repeat.click(); expect(await page.evaluate(() => localStorage.getItem('storecore.commercial-demo.v1'))).toBe(before);
});
test('persisted Unknown account and observation disable the corresponding mutation controls', async ({ page }) => {
  await admin(page); await cta(page, 'ml-tab-competition').click();
  await page.evaluate(() => {
    const key = 'storecore.commercial-demo.v1'; const value = JSON.parse(localStorage.getItem(key)!);
    value.marketplace.account = { wire: 'future-account' }; value.competitors[0].details.availability = { wire: 'future-observation' };
    localStorage.setItem(key, JSON.stringify(value));
  });
  await page.reload(); await expect(page.locator('.marketplace-detail')).toContainText('Cuenta desconocida');
  await cta(page, 'ml-tab-listings').click(); await expect(cta(page, 'marketplace-mapping-save')).toBeDisabled();
  for (const button of await page.locator('[data-cta^="marketplace-mapping-unlink-"]').all()) await expect(button).toBeDisabled();
  await cta(page, 'ml-tab-competition').click(); await expect(page.locator('.marketplace-detail')).toContainText('Observación desconocida');
  for (const action of ['refresh', 'stale', 'unavailable', 'replay']) await expect(cta(page, `marketplace-observation-${action}-competitor-1`)).toBeDisabled();
});
