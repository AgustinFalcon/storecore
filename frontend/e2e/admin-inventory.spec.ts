import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { InventoryAvailability } from '../src/app/domain/user/inventory-availability';
import { UserRole } from '../src/app/domain/user/user-role';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const inventory = [
  { sku: 'WEB-KIT', availableQuantity: 8, reservedQuantity: 3, safetyStock: 2 },
  { sku: 'WEB-LOW', availableQuantity: 1, reservedQuantity: 4, safetyStock: 2 },
  { sku: 'WEB-ZERO', availableQuantity: 0, reservedQuantity: 2, safetyStock: 0 },
  { sku: 'WEB-UNKNOWN', availableQuantity: null, reservedQuantity: 1, safetyStock: 0 },
];

async function mockSession(page: Page, role = UserRole.Operator): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'inventory-user', roles: [role.wire] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'inventory-csrf' } });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
}

for (const width of [390, 768, 1440]) {
  test(`read-only inventory filters, accessibility and reflow at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockSession(page, width === 768 ? UserRole.Admin : UserRole.Operator);
    const methods: string[] = [];
    await page.route('**/api/v1/user/inventory', async (route) => {
      methods.push(route.request().method());
      return route.fulfill({ json: envelope(inventory) });
    });
    await page.goto('/user/inventory');
    await expect(page.getByRole('heading', { name: 'Inventario WEB', exact: true })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await expect(page.locator('tbody tr').filter({ hasText: 'WEB-KIT' })).toContainText('8');
    await expect(page.locator('tbody tr').filter({ hasText: 'WEB-LOW' })).toContainText(InventoryAvailability.Low.label);
    await expect(page.locator('tbody tr').filter({ hasText: 'WEB-ZERO' })).toContainText(InventoryAvailability.Out.label);
    await expect(page.locator('tbody tr').filter({ hasText: 'WEB-UNKNOWN' })).toContainText(InventoryAvailability.Unknown.label);
    await expect(page.getByRole('button', { name: /ajustar|conciliar|historial/i })).toHaveCount(0);
    await page.getByLabel('Buscar por SKU').fill('web-kit');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    await expect(page.locator('#inventory-filter')).toBeVisible();
    await page.locator('#inventory-filter').selectOption({ label: InventoryAvailability.Low.label });
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody')).toContainText('WEB-LOW');
    await page.getByLabel('Buscar por SKU').fill('does-not-exist');
    await expect(page.getByRole('heading', { name: 'Sin coincidencias' })).toBeVisible();
    await page.getByRole('button', { name: 'Mostrar todo el inventario' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`sc22-real-${width}.png`), fullPage: true });
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((method) => method === 'GET')).toBe(true);
  });
}

test('inventory distinguishes initial loading and refresh while retaining its snapshot', async ({ page }) => {
  await mockSession(page);
  let release = (): void => { /* assigned by the request gate */ };
  let gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/v1/user/inventory', async (route) => {
    await gate;
    await route.fulfill({ json: envelope(inventory) });
  });
  await page.goto('/user/inventory');
  await expect(page.getByText('Cargando inventario…', { exact: true })).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
  release();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  gate = new Promise<void>((resolve) => { release = resolve; });
  await page.getByRole('button', { name: 'Actualizar inventario' }).click();
  await expect(page.getByText(/Conservamos la última consulta mientras se carga/)).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Actualizando…', exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole('button', { name: 'Actualizar inventario' })).toBeEnabled();
});

test('inventory retains stale data after failed refresh and clears it on access denial', async ({ page }) => {
  await mockSession(page);
  let status = 200;
  await page.route('**/api/v1/user/inventory', (route) => route.fulfill({ status, json: status === 200 ? envelope(inventory) : { message: 'Consulta no disponible' } }));
  await page.goto('/user/inventory');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  status = 503;
  await page.getByRole('button', { name: 'Actualizar inventario' }).click();
  await expect(page.locator('.inventory__notice[role="alert"]')).toContainText('Pueden haber cambiado');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  status = 403;
  await page.locator('#contenido-principal').getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
  await expect(page.getByLabel('Buscar por SKU')).toHaveCount(0);
});

test('first load has contextual recovery and empty inventory is not a filter failure', async ({ page }) => {
  await mockSession(page);
  let fail = true;
  await page.route('**/api/v1/user/inventory', (route) => route.fulfill({ status: fail ? 503 : 200, json: fail ? {} : envelope([]) }));
  await page.goto('/user/inventory');
  await expect(page.getByRole('heading', { name: 'No pudimos cargar el inventario' })).toBeVisible();
  fail = false;
  await page.locator('#contenido-principal').getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sin inventario para mostrar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sin coincidencias' })).toHaveCount(0);
});
