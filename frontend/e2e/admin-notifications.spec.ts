import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { RouteActor } from '../src/app/features/navigation/productive-route-manifest';
import { installProductiveRouteFixture } from './support/productive-route-fixture';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const alertId = '00000000-0000-4000-8000-000000000001';
const actorId = '42';
const fingerprint = '1'.padStart(64, '0');

const notification = (lifecycle = 'OPEN', revision = '0', operations: string[] = ['ACKNOWLEDGE', 'RESOLVE']) => ({
  notification: {
    id: alertId,
    sourceType: 'STORECORE_FACT',
    sourceId: 'ROUTE-STOCK-1',
    fingerprint,
    category: 'STOCK',
    severity: 'WARNING',
    lifecycle,
    revision,
  },
  createdAt: '2026-11-14T10:00:00Z',
  availableOperations: operations,
});

async function install(page: Page, actor: RouteActor): Promise<void> {
  await installProductiveRouteFixture(page, actor);
}

for (const width of [320, 390, 768, 1440]) {
  test(`notification center remains usable and accessible at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await install(page, RouteActor.Operator);
    await page.goto('/user/notifications');

    await expect(page.getByRole('heading', { name: 'Centro de notificaciones', exact: true })).toBeVisible();
    await expect(page.getByText('1 alertas · Página 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Correo sin configurar.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver detalle de ROUTE-STOCK-1', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByLabel('Severidad').selectOption('WARNING');
    await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await expect(page).toHaveURL(/severity=WARNING/);
    await expect(page).toHaveURL(/page=0/);

    const blocking = (await new AxeBuilder({ page }).analyze()).violations
      .filter(item => item.impact === 'serious' || item.impact === 'critical');
    expect(blocking).toEqual([]);

    await page.getByRole('link', { name: 'Ver detalle de ROUTE-STOCK-1', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Detalle de notificación', exact: true })).toBeVisible();
    await expect(page.getByText('Acceso de lectura.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reconocer', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('administrator applies one lifecycle command with the exact idempotency contract', async ({ page }) => {
  await install(page, RouteActor.Admin);
  let current = notification();
  let postCount = 0;
  let capturedBody: unknown;
  let capturedKey = '';

  await page.route(`**/api/v1/user/notifications/${alertId}`, route => route.fulfill({ json: envelope(current) }));
  await page.route(`**/api/v1/user/notifications/${alertId}/commands`, async route => {
    postCount++;
    capturedBody = route.request().postDataJSON();
    capturedKey = route.request().headers()['idempotency-key'] ?? '';
    const before = current.notification;
    current = notification('ACKNOWLEDGED', '1', ['RESOLVE']);
    await route.fulfill({
      json: envelope({
        commandId: capturedKey,
        alertId,
        actorId,
        operation: 'ACKNOWLEDGE',
        expectedRevision: '0',
        reason: 'Validación operativa',
        occurredAt: '2026-11-14T10:05:00Z',
        outcome: 'APPLIED',
        before,
        after: current.notification,
        currentRevision: '1',
      }),
      headers: { 'X-CSRF-Token': 'rotated-notification-csrf' },
    });
  });

  await page.goto(`/user/notifications/${alertId}`);
  await page.getByLabel('Motivo obligatorio', { exact: false }).fill('Validación operativa');
  await page.getByRole('button', { name: 'Reconocer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirmar cambio', exact: true })).toBeVisible();
  await expect(page.getByText('Vas a cambiar la alerta a Reconocida', { exact: false })).toBeVisible();
  const confirmationBlocking = (await new AxeBuilder({ page }).analyze()).violations
    .filter(item => item.impact === 'serious' || item.impact === 'critical');
  expect(confirmationBlocking).toEqual([]);
  await page.getByRole('button', { name: 'Confirmar cambio', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Comando aplicado' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'Reconocida' }).first()).toBeVisible();
  expect(postCount).toBe(1);
  expect(capturedKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(capturedBody).toEqual({ operation: 'ACKNOWLEDGE', expectedRevision: '0', reason: 'Validación operativa' });
});

test('invalid notification query fails closed without broadening the search', async ({ page }) => {
  const evidence = await installProductiveRouteFixture(page, RouteActor.Admin);
  await page.goto('/user/notifications?severity=FUTURE');
  await expect(page.getByText('Los filtros o el identificador no son válidos.', { exact: true })).toBeVisible();
  await expect(page.getByText('1 alertas · Página 1', { exact: true })).toHaveCount(0);
  expect(evidence.unhandled).toEqual([]);
});
