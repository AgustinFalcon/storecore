import { expect, test } from '@playwright/test';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const stored = { id: 'p-1', sku: 'NEW-1', name: 'Taladro nuevo', description: '', brand: 'Bosch', category: 'Taladros', status: 'DRAFT', images: [], price: { base: 120000, original: 120000, effective: 120000, offer: null }, variants: [{ id: 'v-1', sku: 'NEW-1', name: 'Principal', status: 'ACTIVE', availability: 'AVAILABLE', attributes: {}, inventory: { variantId: 'v-1', sku: 'NEW-1', state: 'KNOWN', available: 6, reserved: 0, safety: 0, onHand: 6, saleable: 6 } }] };

test('operator creates a real catalog product with initial stock', async ({ page }) => {
  let savedBody: Record<string, unknown> | null = null;
  let saved = false;
  await page.route(/\/api\/v1\//, async route => {
    const url = new URL(route.request().url()); const path = url.pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'operator', roles: ['ADMIN'] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'csrf-next' } });
    if (path.endsWith('/catalog/brands')) return route.fulfill({ json: envelope([{ id: '1', name: 'Bosch' }]) });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([{ id: '1', name: 'Taladros' }]) });
    if (path === '/api/v1/user/catalog' && route.request().method() === 'GET') return route.fulfill({ json: envelope({ items: saved ? [stored] : [], total: saved ? 1 : 0, page: 0, size: 50, truncated: false }) });
    if (path === '/api/v1/user/catalog/products/NEW-1' && route.request().method() === 'PUT') {
      savedBody = route.request().postDataJSON() as Record<string, unknown>; saved = true;
      return route.fulfill({ json: envelope(stored), headers: { 'X-CSRF-Token': 'csrf-after-save' } });
    }
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });

  await page.goto('/user/catalog');
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await page.getByLabel('SKU', { exact: true }).first().fill('NEW-1');
  await page.getByLabel('Nombre', { exact: true }).first().fill('Taladro nuevo');
  await page.getByLabel('Marca', { exact: true }).fill('Bosch');
  await page.getByLabel('Categoría', { exact: true }).fill('Taladros');
  await page.getByLabel('Nombre', { exact: true }).nth(1).fill('Principal');
  await page.getByLabel('Stock inicial').fill('6');
  await page.getByLabel('Precio base').fill('120000');
  await page.getByRole('button', { name: 'Guardar producto' }).click();

  await expect(page.getByRole('button', { name: 'NEW-1', exact: true })).toBeVisible();
  expect(savedBody).toMatchObject({ sku: 'NEW-1', name: 'Taladro nuevo', variants: [{ sku: 'NEW-1', name: 'Principal', availableQuantity: 6 }] });
});
