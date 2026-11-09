import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const summary = (sku: string) => ({ sku, name: `Producto ${sku}`, price: { base: 100, original: 100, effective: 100, offer: null } });
const detail = (sku: string) => ({ ...summary(sku), id: sku, description: '', brand: '', category: '', status: 'ACTIVE', images: [], variants: [] });
const inventory = (sku: string) => ({ variantId: sku, sku, productName: `Producto ${sku}`, variantLabel: 'Base', state: 'KNOWN', available: 5, reserved: 1, safety: 1, onHand: 6, saleable: 4 });

async function mockPagedApi(page: Page): Promise<void> {
  await page.route(/\/api\/v1\//, route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const requested = Number(url.searchParams.get('page') ?? 0);
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'operator', roles: ['ADMIN'] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'csrf' } });
    if (path.endsWith('/catalog/brands') || path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    if (path === '/api/v1/catalog') {
      const query = url.searchParams.get('query');
      const items = query ? [summary('FILTERED')] : requested === 0 ? Array.from({ length: 50 }, (_, index) => summary(`PUB-${index + 1}`)) : [summary('PUB-51')];
      return route.fulfill({ json: envelope({ items, total: query ? 1 : 51, page: requested, size: 50, truncated: !query && requested === 0 }) });
    }
    if (path === '/api/v1/user/catalog') {
      const items = requested === 0 ? Array.from({ length: 50 }, (_, index) => detail(`ADM-${index + 1}`)) : [detail('ADM-51')];
      return route.fulfill({ json: envelope({ items, total: 51, page: requested, size: 50, truncated: requested === 0 }) });
    }
    if (path === '/api/v1/user/inventory') {
      const items = requested === 0 ? Array.from({ length: 50 }, (_, index) => inventory(`INV-${index + 1}`)) : [inventory('INV-51')];
      return route.fulfill({ json: envelope({ items, total: 51, page: requested, size: 50, truncated: requested === 0 }) });
    }
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
}

for (const width of [390, 768, 1440]) {
test(`public, admin catalog and inventory traverse bounded pages accessibly at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await mockPagedApi(page);

  await page.goto('/catalog');
  await expect(page.getByRole('link', { name: 'Producto PUB-1', exact: true }).first()).toBeVisible();
  const publicNext = page.getByRole('button', { name: 'Siguiente' });
  await publicNext.focus();
  await publicNext.press('Enter');
  await expect(page.getByRole('link', { name: 'Producto PUB-51', exact: true }).first()).toBeVisible();
  await expect(publicNext).toBeFocused();
  await expect(page.getByText('Página 2 de 2')).toBeVisible();
  await page.getByRole('button', { name: 'Anterior' }).press('Enter');
  await expect(page.getByRole('link', { name: 'Producto PUB-1', exact: true }).first()).toBeVisible();
  await page.getByLabel('Búsqueda').fill('filtrado');
  await page.getByRole('button', { name: 'Buscar', exact: true }).last().click();
  await expect(page.getByRole('link', { name: 'Producto FILTERED', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Página 1 de 1')).toBeVisible();

  await page.goto('/user/catalog');
  const adminNext = page.getByRole('button', { name: 'Siguiente' });
  await adminNext.focus();
  await adminNext.press('Enter');
  await expect(page.getByRole('button', { name: 'ADM-51' })).toBeVisible();
  await expect(adminNext).toBeFocused();
  await page.getByRole('button', { name: 'Anterior' }).press('Enter');
  await expect(page.getByRole('button', { name: 'ADM-1', exact: true })).toBeVisible();

  await page.goto('/user/inventory');
  const inventoryNext = page.getByRole('button', { name: 'Siguiente' });
  await inventoryNext.focus();
  await inventoryNext.press('Enter');
  await expect(page.getByText('INV-51', { exact: false })).toBeVisible();
  await expect(inventoryNext).toBeFocused();
  await page.getByRole('button', { name: 'Anterior' }).press('Enter');
  await expect(page.getByText('INV-1', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Resumen de la página actual' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
});
}
