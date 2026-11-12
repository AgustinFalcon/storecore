import { randomUUID } from 'node:crypto';
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { mapInventoryAdjustmentLookup, mapInventoryAdjustmentReceipt } from '../src/app/data/user/inventory-adjustment.mapper';
import { InventoryAdjustmentLookup, InventoryAdjustmentOutcome, InventoryAdjustmentPhase, InventoryAdjustmentRejection, type InventoryBalance } from '../src/app/domain/user/inventory-adjustment';
import { CapabilityModuleId } from '../src/app/domain/user/capability-module-id';
import { CapabilityModuleState } from '../src/app/domain/user/capability-module-state';
import { RealmFixture, apiLogin, database, origin } from './support/fixtures';

interface FixtureVariant { readonly sku: string; readonly id: string; }
interface FrozenBody { readonly commandId: string; readonly quantityDelta: number; readonly expected: InventoryBalance; readonly reason: string; }
interface Fixture { readonly email: string; readonly variants: readonly FixtureVariant[]; }
enum LedgerEvent { Adjustment = 'ADJUSTMENT' }
enum AuditEvent { InventoryAdjusted = 'INVENTORY_ADJUSTED' }
const path = (variant: FixtureVariant) => `/api/v1/user/inventory/${variant.id}/adjustments`;

async function mutate(page: Page, target: string, body: unknown, method = 'POST', realm = RealmFixture.User): Promise<APIResponse> {
  const csrf = await page.request.get(`/api/v1/${realm.path}/auth/csrf`);
  expect(csrf.status()).toBe(200);
  return page.request.fetch(target, { method, headers: { Origin: origin, 'X-CSRF-Token': csrf.headers()['x-csrf-token']! }, data: body });
}
function capability(email: string, module: CapabilityModuleId, state: CapabilityModuleState): void {
  database(`SELECT capability_session_change_configuration(u.id,s.id,'${module.wire}',m.config_version,'${state.wire}',m.config,'${randomUUID()}'::uuid,'SSA real browser fixture')
    FROM users u JOIN identity_sessions s ON s.user_id=u.id AND s.subject_kind='USER' AND s.revoked_at IS NULL
    CROSS JOIN module_configurations m WHERE u.email='${email}' AND m.module_code='${module.wire}' AND m.state<>'${state.wire}'
    ORDER BY s.issued_at DESC LIMIT 1;`);
}
async function fixture(page: Page): Promise<Fixture> {
  const suffix = randomUUID(); const email = `ssa-${suffix}@example.test`;
  database(`INSERT INTO users(email,password_hash,first_name,last_name) SELECT '${email}',password_hash,'SSA','Fixture' FROM users WHERE email='cfe-user-admin@example.test';
    INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u CROSS JOIN roles r WHERE u.email='${email}' AND r.code='ADMIN';`);
  await apiLogin(page, email);
  for (const module of [CapabilityModuleId.Catalog, CapabilityModuleId.ManualFulfillment]) capability(email, module, CapabilityModuleState.Active);
  const variants: FixtureVariant[] = [];
  for (const tag of ['A', 'B']) {
    const sku = `000-SSA-${suffix}-${tag}`;
    expect((await mutate(page, `/api/v1/user/catalog/products/${sku}`, {
      sku, name: sku, description: 'Safe stock browser fixture', brand: 'Fixture', category: 'Fixture', images: [],
      variants: [{ sku, name: sku, availableQuantity: 8 }], price: { base: 100, effective: 100, priceVersion: 'v1' }, active: true,
    }, 'PUT')).status()).toBe(200);
    const id = database(`SELECT id FROM product_variants WHERE sku='${sku}';`);
    expect(id).toMatch(/^\d+$/);
    database(`UPDATE inventory_balances SET available_quantity=8,reserved_quantity=0,safety_stock=1 WHERE variant_id=${id};`);
    variants.push({ sku, id });
  }
  await page.goto('/login');
  await expect(page).toHaveURL(/\/user\/home$/);
  await page.goto('/user/inventory');
  await expect(page.getByRole('button', { name: `Ajustar disponible de ${variants[0].sku}`, exact: true })).toBeEnabled();
  return { email, variants };
}
async function review(page: Page, variant: FixtureVariant, delta = '-2'): Promise<void> {
  await page.getByRole('button', { name: `Ajustar disponible de ${variant.sku}`, exact: true }).click();
  await page.getByLabel('Variación de disponible', { exact: true }).fill(delta);
  await page.getByLabel('Motivo del ajuste', { exact: true }).fill('Conteo SSA verificado');
  await page.getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
  await expect(page.getByRole('heading', { name: InventoryAdjustmentPhase.Reviewing.label, exact: true })).toBeVisible();
}
function effects(variant: FixtureVariant): { available: number; reserved: number; safety: number; commands: number; ledger: number; audit: number } {
  return JSON.parse(database(`SELECT json_build_object('available',b.available_quantity,'reserved',b.reserved_quantity,'safety',b.safety_stock,
    'commands',(SELECT count(*) FROM inventory_adjustment_commands WHERE variant_id=b.variant_id),
    'ledger',(SELECT count(*) FROM inventory_ledger WHERE variant_id=b.variant_id AND event_type='${LedgerEvent.Adjustment}'),
    'audit',(SELECT count(*) FROM audit_events WHERE aggregate_type='INVENTORY_VARIANT' AND aggregate_id=b.variant_id AND event_type='${AuditEvent.InventoryAdjusted}'))
    FROM inventory_balances b WHERE b.variant_id=${variant.id};`));
}

test('SSA real: UI adjustment and exact replay preserve one balance/ledger/audit effect', async ({ page }) => {
  const { variants: [a] } = await fixture(page);
  await review(page, a);
  const response = page.waitForResponse(candidate => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === path(a));
  await page.getByRole('button', { name: 'Confirmar ajuste', exact: true }).dblclick();
  const applied = await response; expect(applied.status()).toBe(200);
  const body = applied.request().postDataJSON() as FrozenBody;
  const receipt = (await applied.json()).data;
  expect(mapInventoryAdjustmentReceipt(receipt).outcome).toBe(InventoryAdjustmentOutcome.Applied);
  await expect(page.getByRole('heading', { name: InventoryAdjustmentPhase.Applied.label, exact: true })).toBeVisible();
  expect(effects(a)).toEqual({ available: 6, reserved: 0, safety: 1, commands: 1, ledger: 2, audit: 2 });
  const replay = await mutate(page, path(a), body);
  expect(replay.status()).toBe(200); expect((await replay.json()).data).toEqual(receipt);
  expect(effects(a)).toEqual({ available: 6, reserved: 0, safety: 1, commands: 1, ledger: 2, audit: 2 });
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: a.sku })).toContainText('6');
});

test('SSA real: committed response loss blocks every variant through reload and recovers the immutable receipt', async ({ page }) => {
  const { variants: [a, b] } = await fixture(page);
  await review(page, a);
  let body: FrozenBody | undefined;
  await page.route(`**${path(a)}`, async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    body = route.request().postDataJSON() as FrozenBody;
    const committed = await route.fetch(); expect(committed.status()).toBe(200);
    expect(mapInventoryAdjustmentReceipt((await committed.json()).data).outcome).toBe(InventoryAdjustmentOutcome.Applied);
    await route.abort('failed');
  }, { times: 1 });
  await page.getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
  await expect(page.getByRole('heading', { name: InventoryAdjustmentPhase.OutcomeUnknown.label, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: `Ajustar disponible de ${b.sku}`, exact: true })).toBeDisabled();
  expect(effects(b).commands).toBe(0);
  await page.reload();
  await expect(page.getByRole('button', { name: `Ajustar disponible de ${b.sku}`, exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Abrir recuperación del ajuste', exact: true }).click();
  await page.getByRole('button', { name: 'Comprobar resultado', exact: true }).click();
  await expect(page.getByRole('heading', { name: InventoryAdjustmentPhase.Applied.label, exact: true })).toBeVisible();
  expect(body).toBeDefined();
  const lookup = await page.request.get(`${path(a)}/${body!.commandId}`);
  expect(lookup.status()).toBe(200);
  const recovered = mapInventoryAdjustmentLookup((await lookup.json()).data);
  expect(recovered.lookup).toBe(InventoryAdjustmentLookup.Found);
  expect(recovered.receipt?.commandId).toBe(body!.commandId);
  const replay = await mutate(page, path(a), body!);
  expect(replay.status()).toBe(200);
  expect(mapInventoryAdjustmentReceipt((await replay.json()).data)).toEqual(recovered.receipt);
  expect(effects(a)).toEqual({ available: 6, reserved: 0, safety: 1, commands: 1, ledger: 2, audit: 2 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: `Ajustar disponible de ${b.sku}`, exact: true })).toBeEnabled();
});

test('SSA real: stale review rejects durably and a fresh review uses a new command', async ({ page, browser }) => {
  const { email, variants: [a] } = await fixture(page);
  await review(page, a);
  const competing: FrozenBody = { commandId: randomUUID(), quantityDelta: 1, expected: { available: 8, reserved: 0, safety: 1 }, reason: 'SSA competing command' };
  const competingContext = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    const other = await competingContext.newPage(); await apiLogin(other, email);
    expect((await mutate(other, path(a), competing)).status()).toBe(200);
  } finally { await competingContext.close(); }
  const rejected = page.waitForResponse(candidate => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === path(a))
    .then(async response => ({ response, payload: await response.json() }));
  await page.getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
  const { response: conflict, payload } = await rejected; expect(conflict.status()).toBe(409);
  const frozen = conflict.request().postDataJSON() as FrozenBody;
  expect(mapInventoryAdjustmentReceipt(payload.data).rejection).toBe(InventoryAdjustmentRejection.BalanceChanged);
  await expect(page.getByRole('heading', { name: InventoryAdjustmentPhase.Conflict.label, exact: true })).toBeVisible();
  expect(effects(a)).toEqual({ available: 9, reserved: 0, safety: 1, commands: 2, ledger: 2, audit: 2 });
  const replay = await mutate(page, path(a), frozen); expect(replay.status()).toBe(409);
  expect(mapInventoryAdjustmentReceipt((await replay.json()).data).rejection).toBe(InventoryAdjustmentRejection.BalanceChanged);
  await page.reload(); await review(page, a);
  const fresh = page.waitForResponse(candidate => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === path(a));
  await page.getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
  const applied = await fresh; expect(applied.status()).toBe(200);
  expect((applied.request().postDataJSON() as FrozenBody).commandId).not.toBe(frozen.commandId);
  expect(effects(a)).toEqual({ available: 7, reserved: 0, safety: 1, commands: 3, ledger: 3, audit: 3 });
});

test('SSA real: capability denial and CUSTOMER/anonymous sessions cannot adjust stock', async ({ page, browser }) => {
  const { email, variants: [a] } = await fixture(page);
  const command: FrozenBody = { commandId: randomUUID(), quantityDelta: 1, expected: { available: 8, reserved: 0, safety: 1 }, reason: 'SSA authority fixture' };
  capability(email, CapabilityModuleId.ManualFulfillment, CapabilityModuleState.ReadOnly);
  try {
    expect((await mutate(page, path(a), command)).status()).toBe(409);
    await page.reload();
    await expect(page.getByRole('button', { name: `Ajustar disponible de ${a.sku}`, exact: true })).toHaveCount(0);
    const context = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
    try {
      const customer = await context.newPage();
      expect((await customer.request.post(path(a), { headers: { Origin: origin, 'X-CSRF-Token': 'absent' }, data: command })).status()).toBe(401);
      await apiLogin(customer, 'ua-customer@example.test');
      expect((await mutate(customer, path(a), command, 'POST', RealmFixture.Customer)).status()).toBe(401);
    } finally { await context.close(); }
    expect(effects(a)).toEqual({ available: 8, reserved: 0, safety: 1, commands: 0, ledger: 1, audit: 1 });
  } finally { capability(email, CapabilityModuleId.ManualFulfillment, CapabilityModuleState.Active); }
});
