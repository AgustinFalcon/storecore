import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CapabilityModuleState } from '../src/app/domain/user/capability-module-state';
import { UserRole } from '../src/app/domain/user/user-role';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const modules = [
  { module: 'CATALOG', state: 'ACTIVE', configVersion: 7 },
  { module: 'MARKETPLACE_ML', state: 'UNKNOWN_FUTURE_STATE', configVersion: null },
  { module: 'PAYMENTS_MP', state: 'READ_ONLY', configVersion: 3 },
  { module: 'MANUAL_PROMOTIONS', state: 'PAUSED', configVersion: 9 },
];

async function mockSession(page: Page, role = UserRole.Operator): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'capabilities-user', roles: [role.wire] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'capabilities-csrf' } });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
}

for (const width of [390, 768, 1440]) {
  test(`capabilities is professional, read-only and accessible at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockSession(page, width === 768 ? UserRole.Admin : UserRole.Operator);
    const capabilityMethods: string[] = [];
    await page.route('**/api/v1/user/capabilities**', async (route) => {
      capabilityMethods.push(route.request().method());
      if (route.request().method() !== 'GET') return route.fulfill({ status: 405, json: {} });
      return route.fulfill({ json: envelope(modules) });
    });
    await page.goto('/user/capabilities');
    await expect(page.getByRole('heading', { name: 'Módulos del comercio', exact: true })).toBeVisible();
    await expect(page.locator('.capability-card')).toHaveCount(7);
    for (const name of ['Catálogo', 'Inventario', 'Mercado Libre', 'Outlet', 'ARCA', 'Envíos avanzados', 'Conectores de billeteras']) {
      await expect(page.locator('.capability-card').filter({ has: page.getByRole('heading', { name, exact: true }) })).toHaveCount(1);
    }
    await expect(page.locator('.capability-card').first().locator('dt')).toHaveText(['Estado operativo', 'Disponibilidad', 'Nivel de entrega']);
    await expect(page.locator('.capabilities__table tbody tr')).toHaveCount(4);
    await expect(page.locator('.capabilities__technical')).toContainText('Pagos con Mercado Pago');
    await expect(page.getByRole('button', { name: /habilitar|deshabilitar|guardar|pausar módulo|cambiar estado/i })).toHaveCount(0);

    await page.getByLabel('Buscar módulo').fill('envios');
    await expect(page.locator('.capability-card')).toHaveCount(1);
    await expect(page.locator('.capability-card')).toContainText('Envíos avanzados');
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await page.locator('#capability-filter').selectOption({ label: CapabilityModuleState.Active.label });
    await expect(page.locator('.capability-card')).toHaveCount(1);
    await expect(page.locator('.capability-card')).toContainText('Catálogo');
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();

    const infoButton = page.getByRole('button', { name: 'Ver información de Outlet' });
    await infoButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible(); await expect(dialog).toContainText('no crea un ID productivo');
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(infoButton).toBeFocused();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`sc24-real-${width}.png`), fullPage: true });
    expect(capabilityMethods.length).toBeGreaterThan(0); expect(capabilityMethods.every((method) => method === 'GET')).toBe(true);
  });
}

test('capabilities preserves stale data, then fails closed on access denial', async ({ page }) => {
  await mockSession(page); let status = 200;
  await page.route('**/api/v1/user/capabilities**', (route) => route.fulfill({ status, json: status === 200 ? envelope(modules) : {} }));
  await page.goto('/user/capabilities'); await expect(page.locator('.capability-card')).toHaveCount(7);
  status = 503; await page.getByRole('button', { name: 'Actualizar módulos' }).click();
  await expect(page.locator('.capabilities__notice[role=alert]')).toContainText('última consulta'); await expect(page.locator('.capability-card')).toHaveCount(7);
  status = 403; await page.locator('#contenido-principal').getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible(); await expect(page.locator('.capability-card')).toHaveCount(0);
});

test('capabilities distinguishes loading, first error and valid empty technical catalog', async ({ page }) => {
  await mockSession(page); let release = (): void => { /* assigned below */ }; let status = 200;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/v1/user/capabilities**', async (route) => { await gate; await route.fulfill({ status, json: status === 200 ? envelope([]) : {} }); });
  await page.goto('/user/capabilities'); await expect(page.getByText('Cargando módulos…', { exact: true })).toBeVisible();
  status = 503; release(); await expect(page.getByRole('heading', { name: 'No pudimos cargar los módulos' })).toBeVisible();
  await page.unroute('**/api/v1/user/capabilities**');
  await page.route('**/api/v1/user/capabilities**', (route) => route.fulfill({ json: envelope([]) }));
  await page.locator('#contenido-principal').getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { name: 'Sin módulos técnicos configurados' })).toBeVisible(); await expect(page.locator('.capability-card')).toHaveCount(7);
});
