import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });

function product(sku: string, name: string, status = 'ACTIVE', secondarySku = `${sku}-SEC`, variantStatus = status) {
  return {
    id: sku, sku, name, description: '', brand: 'Bosch', category: 'Herramientas', status, images: [], productBasePrice: 100,
    price: { base: 100, original: 100, effective: 100, offer: null },
    variants: [{ id: `${sku}-variant`, sku: secondarySku, name: 'Secundaria', status: variantStatus, availability: 'AVAILABLE', attributes: {},
      pricePolicy: { mode: 'INHERITED', base: null }, price: { state: 'KNOWN', price: { base: 100, original: 100, effective: 100, offer: null } },
      inventory: { variantId: `${sku}-variant`, sku: secondarySku, state: 'KNOWN', available: 4, reserved: 0, safety: 0, onHand: 4, saleable: 4 } }],
  };
}

async function installSearchApi(page: Page, observed: URL[]): Promise<void> {
  await page.route(/\/api\/v1\//, route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'admin', roles: ['ADMIN'] }) });
    if (path.endsWith('/customer/me')) return route.fulfill({ status: 401, json: {} });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'csrf' } });
    if (path.endsWith('/catalog/brands') || path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    if (path === '/api/v1/catalog' || path === '/api/v1/user/catalog') {
      observed.push(url);
      const query = url.searchParams.get('query') ?? '';
      const admin = path.includes('/user/');
      const item = query === 'taladro' ? product('NAME-1', 'Taladro por nombre')
        : query === 'sku-sec' ? product('SKU-1', 'Producto por SKU secundario', 'ACTIVE', 'SKU-SEC')
          : query === 'herramientas' ? product('CATEGORY-1', 'Producto por categoría')
            : query === 'hidden-sku' && admin ? product('VISIBLE-1', 'Producto con SKU inactivo', 'ACTIVE', 'HIDDEN-SKU', 'INACTIVE') : null;
      return route.fulfill({ json: envelope({ items: item ? [item] : [], total: item ? 1 : 0, page: 0, size: 50, truncated: false }) });
    }
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    return route.fulfill({ status: 503, json: {} });
  });
}

test('public and admin search transport name, secondary SKU and category without leaking inactive products', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  const observed: URL[] = [];
  await installSearchApi(page, observed);
  await page.goto('/catalog');
  const publicSearch = page.getByLabel('Búsqueda');
  for (const [query, result] of [['taladro', 'Taladro por nombre'], ['sku-sec', 'Producto por SKU secundario'], ['herramientas', 'Producto por categoría']] as const) {
    await publicSearch.fill(query);
    await page.getByRole('button', { name: 'Buscar', exact: true }).last().click();
    await expect(page.getByRole('link', { name: result, exact: true }).first()).toBeVisible();
    expect(observed.at(-1)?.pathname).toBe('/api/v1/catalog');
    expect(observed.at(-1)?.searchParams.get('query')).toBe(query);
  }
  await publicSearch.fill('hidden-sku');
  const publicReads = observed.length;
  await page.getByRole('button', { name: 'Buscar', exact: true }).last().click();
  await expect.poll(() => observed.length).toBe(publicReads + 1);
  await expect(page.getByText('No hay productos activos para estos filtros.')).toBeVisible();
  await expect(page.getByText('Producto con SKU inactivo')).toHaveCount(0);

  await page.goto('/user/catalog');
  const adminSearch = page.getByLabel('Buscar por nombre, SKU o categoría');
  for (const [query, result] of [['taladro', 'Taladro por nombre'], ['sku-sec', 'Producto por SKU secundario'], ['herramientas', 'Producto por categoría']] as const) {
    await adminSearch.fill(query);
    await page.getByRole('button', { name: 'Buscar', exact: true }).last().click();
    await expect(page.getByText(result, { exact: true })).toBeVisible();
    expect(observed.at(-1)?.pathname).toBe('/api/v1/user/catalog');
    expect(observed.at(-1)?.searchParams.get('query')).toBe(query);
  }
  await adminSearch.fill('hidden-sku');
  await page.getByRole('button', { name: 'Buscar', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'VISIBLE-1' })).toBeVisible();
  await expect(page.getByText('Producto con SKU inactivo', { exact: true })).toBeVisible();
  expect(observed.at(-1)?.pathname).toBe('/api/v1/user/catalog');
  expect(observed.at(-1)?.searchParams.get('query')).toBe('hidden-sku');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
});
