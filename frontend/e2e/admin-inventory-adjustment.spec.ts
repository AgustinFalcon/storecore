import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CapabilityModuleId } from '../src/app/domain/user/capability-module-id';
import { CapabilityModuleState } from '../src/app/domain/user/capability-module-state';
import { UserRole } from '../src/app/domain/user/user-role';
const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const inventory = { items: [{ variantId: '42', sku: 'WEB-KIT', productName: 'Kit', variantLabel: 'Grande', state: 'KNOWN', available: 8, reserved: 3, safety: 2, onHand: 11, saleable: 6 }], total: 1, page: 0, size: 50, truncated: false };
async function setup(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'inventory-user', roles: [UserRole.Operator.wire] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'inventory-csrf' } });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    if (path.endsWith('/user/capabilities')) return route.fulfill({ json: envelope([{ module: CapabilityModuleId.ManualFulfillment.wire, state: CapabilityModuleState.Active.wire, configVersion: 1 }]) });
    if (path.endsWith('/user/inventory')) return route.fulfill({ json: envelope(inventory) });
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
}
async function review(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ajustar disponible de WEB-KIT', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Variación de disponible', { exact: true }).fill('-2');
  await page.getByLabel('Motivo del ajuste', { exact: true }).fill('Conteo verificado');
  await page.getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
}
for (const width of [320, 390, 768, 1440]) {
  test(`inventory adjustment review, keyboard, focus and reflow at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await setup(page);
    let posts = 0;
    await page.route('**/user/inventory/42/adjustments', async route => {
      posts++; const body = route.request().postDataJSON();
      await route.fulfill({ json: envelope({ commandId: body.commandId, variantId: '42', state: 'APPLIED', reason: null, before: body.expected, after: { available: 6, reserved: 3, safety: 2 }, ledgerId: '9', recordedAt: '2026-11-10T00:00:00Z' }) });
    });
    await page.goto('/user/inventory'); await review(page);
    await expect(page.getByRole('heading', { name: 'Revisar ajuste', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('dialog').getByRole('button', { name: 'Confirmar ajuste', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Cerrar ajuste', exact: true })).toBeFocused();
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(item => item.impact === 'serious' || item.impact === 'critical'); expect(violations).toEqual([]);
    expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Confirmar ajuste', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Ajuste registrado', exact: true })).toBeVisible();
    expect(posts).toBe(1); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(page.getByRole('button', { name: 'Ajustar disponible de WEB-KIT', exact: true })).toBeFocused();
  });
}
test('lost response survives closing and reload, NOT_FOUND keeps uncertainty, replay retains exact command', async ({ page }) => {
  await setup(page); const bodies: unknown[] = [];
  await page.route('**/user/inventory/42/adjustments', async route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    if (bodies.length === 1) return route.abort('failed');
    return route.fulfill({ json: envelope({ commandId: body.commandId, variantId: '42', state: 'APPLIED', reason: null, before: body.expected, after: { available: 6, reserved: 3, safety: 2 }, ledgerId: '9', recordedAt: '2026-11-10T00:00:00Z' }) });
  });
  await page.route('**/user/inventory/42/adjustments/*', route => route.fulfill({ json: envelope({ lookup: 'NOT_FOUND', receipt: null }) }));
  await page.goto('/user/inventory'); await review(page); await page.getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resultado pendiente de comprobar', exact: true })).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Ajustar disponible de WEB-KIT', exact: true })).toBeDisabled(); await page.reload();
  await page.getByRole('button', { name: 'Abrir recuperación del ajuste', exact: true }).click(); await page.getByRole('button', { name: 'Comprobar resultado', exact: true }).click();
  await expect(page.getByText('Aún no hay un recibo confirmado.', { exact: false })).toBeVisible(); expect(bodies).toHaveLength(1);
  await page.getByRole('button', { name: 'Reenviar el mismo intento', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Ajuste registrado', exact: true })).toBeVisible();
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
});
