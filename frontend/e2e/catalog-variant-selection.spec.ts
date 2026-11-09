import { expect, test } from '@playwright/test';

test('PDP follows the requested SKU when the same product route is reused', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const envelope = (data: unknown) => ({ code: 200, data, message: null });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/catalog/products/')) {
      const sku = path.split('/').at(-1);
      return route.fulfill({ json: envelope({ id: 'p', sku, name: 'Producto con variantes', status: 'ACTIVE', images: [], media: [],
        price: { base: 10, original: 10, effective: 10, offer: null },
        variants: ['A', 'B'].map(sku => ({ id: sku, sku, name: `Variante ${sku}`, status: 'ACTIVE', availability: 'AVAILABLE', attributes: {},
          inventory: { variantId: sku, sku, state: 'KNOWN', available: 4, reserved: 1, safety: 1, onHand: 5, saleable: 3 } })) }) });
    }
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    return route.fulfill({ status: 401, json: {} });
  });
  await page.goto('/catalog/B');
  await expect(page.getByRole('heading', { name: 'Producto con variantes' })).toBeVisible();
  await expect(page.locator('select[name="variant"]')).toHaveValue('B');
  await page.locator('input[name="quantity"]').fill('2');
  await page.evaluate(() => { history.pushState({}, '', '/catalog/A'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByText('SKU A', { exact: true })).toBeVisible();
  await expect(page.locator('select[name="variant"]')).toHaveValue('A');
  await expect(page.locator('input[name="quantity"]')).toHaveValue('1');
});
