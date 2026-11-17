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

test('admin conflict preserves the draft and requires explicit reapply before publishing the new revision', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const writes: Array<Record<string, unknown>> = [];
  let reads = 0;
  const localLabel = 'Color elegido por el administrador';
  const remote = { ...options, revision: 8, axes: options.axes.map(axis => ({ ...axis, label: 'Color publicado por otra sesión',
    values: [...axis.values].reverse().map((value, order) => ({ ...value, order })) })) };
  let published = remote;
  await page.route(/\/api\/v1\//, route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'admin', roles: ['ADMIN'] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'csrf' } });
    if (path.endsWith('/catalog/brands') || path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    if (path === '/api/v1/user/catalog') return route.fulfill({ json: envelope({ items: [product], total: 1, page: 0, size: 50, truncated: false }) });
    if (path === '/api/v1/user/catalog/products/DRILL-1/options' && request.method() === 'GET') {
      const snapshot = reads++ === 0 ? options : reads === 2 ? remote : published;
      return route.fulfill({ json: envelope(snapshot) });
    }
    if (path === '/api/v1/user/catalog/products/DRILL-1/options' && request.method() === 'PUT') {
      const body = request.postDataJSON() as Record<string, unknown>; writes.push(body);
      if (writes.length === 1) return route.fulfill({ status: 409, json: { code: 409, message: 'Conflict', errorCode: 'CATALOG_OPTION_REVISION_CONFLICT' } });
      published = { ...remote, revision: 9, axes: body['axes'] as typeof remote.axes };
      return route.fulfill({ json: envelope({ revision: 9, state: 'VALID' }) });
    }
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });

  await page.goto('/user/catalog');
  await page.getByRole('button', { name: 'Configurar opciones' }).click();
  const label = page.locator('sc-admin-product-options').getByLabel('Nombre').first();
  await label.fill(localLabel);
  await page.getByRole('button', { name: 'Guardar opciones' }).click();
  await expect(page.getByRole('heading', { name: 'Comparar cambios' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  await expect(label).toHaveValue(localLabel);
  expect(writes).toHaveLength(1);
  expect(writes[0]?.['expectedRevision']).toBe(7);
  await page.getByLabel(new RegExp(`Conservar mi borrador: ${localLabel}`)).check();
  await page.getByRole('button', { name: 'Preparar reaplicación' }).click();
  await expect(page.getByText('Reaplicación preparada. Revisá el resultado y elegí Guardar para publicarlo.')).toBeVisible();
  expect(writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Guardar opciones' }).click();
  await expect(page.getByText('Opciones publicadas y verificadas.')).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]?.['expectedRevision']).toBe(8);
  const submittedAxis = (writes[1]?.['axes'] as Array<{ label: string; values: Array<{ code: string }> }>)[0];
  expect(submittedAxis?.label).toBe(localLabel);
  expect(submittedAxis?.values.map(value => value.code)).toEqual(['blue', 'red']);
  expect(published.axes[0]?.label).toBe(localLabel);
});
