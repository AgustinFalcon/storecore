import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const missing = { state: 'UNAVAILABLE', value: null, freshness: 'UNAVAILABLE', reason: 'EXTERNAL_NOT_AVAILABLE' };
const policy = { id: '1', listingSku: 'SKU-LOCAL', currency: 'ARS', priceScope: 'CAMPAIGN', basePrice: 100, desiredPrice: 90, observedPrice: missing, effectivePromoPrice: 85, status: 'DRAFT', validFrom: '2026-11-08T10:00:00Z', validTo: '2026-11-09T10:00:00Z', writer: 'MANUAL', approvedBy: null, approvedAt: null };
const paged = (items: unknown[], total = items.length, page = 0) => ({ items, total, page, size: 25, truncated: total > items.length });
async function session(page: Page): Promise<void> {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'admin', roles: ['ADMIN'] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'test-csrf' } });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
}
for (const width of [390, 768, 1440]) {
  test(`manual price policy reflows with accessible persisted data at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 }); await session(page);
    await page.route('**/api/v1/user/promos?*', route => route.fulfill({ json: envelope(paged([policy])) }));
    await page.goto('/user/promos');
    await expect(page.getByRole('heading', { name: 'Políticas de precio manual' })).toBeVisible();
    const card = page.locator('article.sc-card'); await expect(card).toContainText('SKU-LOCAL');
    await expect(card).toContainText('Precio base100'); await expect(card).toContainText('Precio deseado local90');
    await expect(card).toContainText('Precio promocional efectivo85'); await expect(card).toContainText('Observación no disponible');
    await expect(page.getByLabel(/Aprobador|Aprobado|Prioridad|Margen/)).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Finalizar' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).analyze(); expect(result.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`pricing-${width}.png`), fullPage: true });
  });
}
test('creates a draft without approval or priority then shows server-owned approval after activation', async ({ page }) => {
  await session(page); let rows: typeof policy[] = []; const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/v1/user/promos**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') return route.fulfill({ json: envelope(paged(rows)) });
    const body = request.postDataJSON() as Record<string, unknown>; writes.push({ path, body });
    rows = [{ ...policy, ...(path.endsWith('/state') ? { status: 'ACTIVE', approvedBy: 'server-admin', approvedAt: '2026-11-08T10:01:00Z' } : {}) } as typeof policy];
    return route.fulfill({ json: envelope(rows[0]) });
  });
  await page.goto('/user/promos'); await expect(page.getByText('No hay políticas en esta página.')).toBeVisible();
  await page.getByLabel('SKU', { exact: true }).fill('SKU-LOCAL');
  await page.getByLabel('Precio deseado local', { exact: true }).fill('90');
  await page.getByLabel('Desde', { exact: true }).fill('2026-11-08T10:00'); await page.getByLabel('Hasta', { exact: true }).fill('2026-11-09T10:00');
  await page.getByRole('button', { name: 'Crear borrador' }).click(); await expect(page.locator('article')).toContainText('Borrador');
  expect(Object.keys(writes[0].body).sort()).toEqual(['currency', 'desiredPrice', 'effectivePromoPrice', 'listingSku', 'priceScope', 'validFrom', 'validTo', 'writer'].sort());
  await page.getByRole('button', { name: 'Activar', exact: true }).click(); await expect(page.locator('article')).toContainText('server-admin');
  expect(writes[1].body).toEqual({ transition: 'ACTIVATE' });
});
test('pages policies and fails closed for unknown state and recoverable error', async ({ page }) => {
  await session(page); let fail = false;
  await page.route('**/api/v1/user/promos?*', route => {
    const requestedPage = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({ status: fail ? 503 : 200, json: fail ? {} : envelope(paged([{ ...policy, id: String(requestedPage + 1), status: 'FUTURE_STATE' }], 26, requestedPage)) });
  });
  await page.goto('/user/promos'); await expect(page.locator('article')).toContainText('Estado no reconocido'); await expect(page.getByText('FUTURE_STATE')).toHaveCount(0);
  await expect(page.locator('article button')).toHaveCount(0); await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('status')).toContainText('Página 2');
  fail = true; await page.getByRole('button', { name: 'Anterior' }).click(); await expect(page.getByRole('alert')).toBeVisible();
  fail = false; await page.getByRole('button', { name: 'Reintentar' }).click(); await expect(page.getByRole('alert')).toHaveCount(0);
});
