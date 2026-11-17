import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const product = { id: 'p-1', sku: 'DRILL-1', name: 'Taladro profesional', description: '', brand: 'Bosch', category: 'Taladros', status: 'ACTIVE', images: [], productBasePrice: 120000,
  price: { base: 120000, original: 120000, effective: 120000, offer: null }, variants: [{ pricePolicy: { mode: 'INHERITED', base: null }, price: { state: 'KNOWN', price: { base: 120000, original: 120000, effective: 120000, offer: null } }, id: '1', sku: 'DRILL-1', name: 'Principal', status: 'ACTIVE', availability: 'AVAILABLE', attributes: {}, inventory: { variantId: '1', sku: 'DRILL-1', state: 'KNOWN', available: 6, reserved: 0, safety: 0, onHand: 6, saleable: 6 } }] };
const longLabel = 'Color de terminación profesional para ambientes industriales y uso intensivo';
const options = { revision: 7, state: 'VALID', cause: null, axes: [{ code: 'color', label: longLabel, presentation: 'SWATCH', order: 0,
  values: [{ code: 'red', label: 'Rojo industrial de alta visibilidad', order: 0, swatchColor: '#cc0000' }, { code: 'blue', label: 'Azul profesional', order: 1, swatchColor: '#0044cc' }] }],
  assignments: Array.from({ length: 30 }, (_, index) => ({ variantId: String(index + 1), variantSku: `DRILL-${String(index + 1).padStart(2, '0')}`, active: index < 2, optionValues: { color: index % 2 ? 'blue' : 'red' } })) };

async function mockAdmin(page: Page, role = 'ADMIN'): Promise<void> {
  await page.route(/\/api\/v1\//, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: role.toLocaleLowerCase(), roles: [role] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'csrf' } });
    if (path.endsWith('/catalog/brands') || path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    if (path === '/api/v1/user/catalog') return route.fulfill({ json: envelope({ items: [product], total: 1, page: 0, size: 50, truncated: false }) });
    if (path === '/api/v1/user/catalog/products/DRILL-1/options') return route.fulfill({ json: envelope(options) });
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
  test(`option editor is usable and accessible at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await mockAdmin(page); await page.goto('/user/catalog');
    const trigger = page.getByRole('button', { name: 'Configurar opciones' }); await trigger.focus(); await trigger.press('Enter');
    await expect(page.getByRole('heading', { name: /Opciones de compra · DRILL-1/ })).toBeFocused();
    await expect(page.getByText(longLabel, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Mostrando hasta 25 de 30 variantes.')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(results.violations, null, 2)).toEqual([]);
    const clear = page.getByRole('button', { name: 'Quitar configuración', exact: true }); await clear.focus(); await clear.press('Enter');
    await expect(page.getByRole('button', { name: 'Sí, quitar configuración' })).toBeFocused(); await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  });
}

test('operator can find a variant beyond the first page without mutation controls', async ({ page }) => {
  await mockAdmin(page, 'OPERATOR'); await page.goto('/user/catalog'); await page.getByRole('button', { name: 'Configurar opciones' }).click();
  const search = page.getByLabel('Buscar variante por SKU'); await expect(search).toBeEnabled(); await search.fill('DRILL-30');
  await expect(page.getByText('DRILL-30', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar opciones' })).toBeDisabled();
  await expect(page.getByLabel('Activa', { exact: true }).first()).toBeDisabled();
});
