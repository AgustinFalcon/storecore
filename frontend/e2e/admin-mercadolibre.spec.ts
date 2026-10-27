import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { UserRole } from '../src/app/domain/user/user-role';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const account = { authorized: true, accountRef: 'ML-STORE-01', status: 'ACTIVE' };
const listings = [
  { listingId: 'MLA-100', variationId: 'VAR-RED', sku: 'WEB-KIT' },
  { listingId: 'MLA-200', variationId: '', sku: 'WEB-LAMP' },
  { listingId: 'MLA-300', variationId: 'VAR-BLUE', sku: 'WEB-KIT' },
];

async function mockSession(page: Page, role = UserRole.Operator): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'ml-user', roles: [role.wire] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'ml-csrf' } });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
}

for (const width of [390, 768, 1440]) {
  test(`Mercado Libre read surface filters and reflows at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 }); await mockSession(page, width === 768 ? UserRole.Admin : UserRole.Operator);
    const methods: string[] = [];
    await page.route('**/api/v1/user/mercadolibre/account', (route) => { methods.push(route.request().method()); return route.fulfill({ json: envelope(account) }); });
    await page.route('**/api/v1/user/mercadolibre/listings', (route) => { methods.push(route.request().method()); return route.fulfill({ json: envelope(listings) }); });
    await page.goto('/user/mercadolibre');
    await expect(page.getByRole('heading', { name: 'Mercado Libre', exact: true })).toBeVisible();
    await expect(page.getByText('••••E-01', { exact: true })).toBeVisible(); await expect(page.getByText('ML-STORE-01')).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(3);
    await expect(page.getByText('3 de 3 mapeos')).toBeVisible();
    await page.getByLabel('Buscar publicación, variación o SKU').fill('web-kit');
    await expect(page.locator('tbody tr')).toHaveCount(2); await expect(page.getByText('2 de 3 mapeos')).toBeVisible();
    await page.getByLabel('Buscar publicación, variación o SKU').fill('var-red'); await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByLabel('Buscar publicación, variación o SKU').fill('missing');
    await expect(page.getByRole('heading', { name: 'Sin coincidencias' })).toBeVisible();
    await page.getByRole('button', { name: 'Mostrar todos los mapeos' }).click(); await expect(page.locator('tbody tr')).toHaveCount(3);
    await expect(page.getByText(/OAuth, cambios de publicaciones/)).toBeVisible();
    await expect(page.getByRole('button', { name: /conectar|desconectar|sincronizar|guardar|mapear/i })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).analyze(); expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`sc23-real-${width}.png`), fullPage: true });
    expect(methods).toHaveLength(2); expect(methods.every((method) => method === 'GET')).toBe(true);
  });
}

test('Mercado Libre distinguishes first loading, refresh and stale recovery', async ({ page }) => {
  await mockSession(page); let release = (): void => {}; let gate = new Promise<void>((resolve) => { release = resolve; }); let fail = false;
  await page.route('**/api/v1/user/mercadolibre/account', async (route) => { await gate; return route.fulfill({ status: fail ? 503 : 200, json: fail ? {} : envelope(account) }); });
  await page.route('**/api/v1/user/mercadolibre/listings', async (route) => { await gate; return route.fulfill({ status: fail ? 503 : 200, json: fail ? {} : envelope(listings) }); });
  await page.goto('/user/mercadolibre'); await expect(page.getByText('Cargando cuenta y publicaciones…')).toBeVisible(); expect(await page.locator('table').count()).toBe(0);
  release(); await expect(page.locator('tbody tr')).toHaveCount(3);
  gate = new Promise<void>((resolve) => { release = resolve; });
  await page.getByRole('button', { name: 'Actualizar datos' }).click(); await expect(page.getByText(/Conservamos la última consulta/)).toBeVisible(); await expect(page.locator('tbody tr')).toHaveCount(3);
  fail = true; release(); await expect(page.locator('.ml__notice[role=alert]')).toContainText('última consulta'); await expect(page.locator('tbody tr')).toHaveCount(3);
});

test('Mercado Libre clears protected data on 403 and presents successful empty data', async ({ page }) => {
  await mockSession(page); let status = 403;
  await page.route('**/api/v1/user/mercadolibre/account', (route) => route.fulfill({ status, json: status === 200 ? envelope(account) : {} }));
  await page.route('**/api/v1/user/mercadolibre/listings', (route) => route.fulfill({ status, json: status === 200 ? envelope([]) : {} }));
  await page.goto('/user/mercadolibre'); await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible(); await expect(page.locator('table')).toHaveCount(0);
  status = 200; await page.reload(); await expect(page.getByRole('heading', { name: 'Sin publicaciones vinculadas' })).toBeVisible();
});

test('unknown account status is not printed as a valid provider status', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/v1/user/mercadolibre/account', (route) => route.fulfill({ json: envelope({ ...account, status: 'FUTURE_STATUS' }) }));
  await page.route('**/api/v1/user/mercadolibre/listings', (route) => route.fulfill({ json: envelope(listings) }));
  await page.goto('/user/mercadolibre'); await expect(page.getByText('Estado no reconocido', { exact: true })).toBeVisible(); await expect(page.getByText('FUTURE_STATUS')).toHaveCount(0);
});
