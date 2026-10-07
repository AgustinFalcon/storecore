import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { mapAdminOrder } from '../src/app/data/mappers/http-mappers';
import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from '../src/app/domain/order/commerce-states';
import { AccessContext, RealmFixture, apiLogin, assertRealm, database, origin, password, uiLogin } from './support/fixtures';

enum FixtureModule { Storefront = 'STOREFRONT', Catalog = 'CATALOG', Payments = 'PAYMENTS_MP', Fulfillment = 'MANUAL_FULFILLMENT', Profile = 'PROFILE_CONTENT' }
enum FixtureCapabilityState { Active = 'ACTIVE' }
const cfeAdminEmail = 'cfe-user-admin@example.test';

async function mutate(page: Page, realm: RealmFixture, path: string, data: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<APIResponse> {
  const csrf = await page.request.get(`/api/v1/${realm.path}/auth/csrf`);
  expect(csrf.status()).toBe(200);
  return page.request.fetch(path, { method, headers: { Origin: origin, 'X-CSRF-Token': csrf.headers()['x-csrf-token']! }, data });
}

async function checkout(page: Page): Promise<string> {
  await apiLogin(page, cfeAdminEmail);
  for (const module of Object.values(FixtureModule)) {
    database(`SELECT capability_session_change_configuration(u.id,s.id,'${module}',m.config_version,'${FixtureCapabilityState.Active}','{}'::jsonb,'${randomUUID()}'::uuid,'CFE browser fixture')
      FROM users u JOIN identity_sessions s ON s.user_id=u.id AND s.subject_kind='USER' AND s.revoked_at IS NULL
      CROSS JOIN module_configurations m WHERE u.email='${cfeAdminEmail}' AND m.module_code='${module}'
        AND (m.state<>'${FixtureCapabilityState.Active}' OR m.config<>'{}'::jsonb)
      ORDER BY s.issued_at DESC LIMIT 1;`);
  }
  const sku = `CFE-${randomUUID()}`;
  const product = await mutate(page, RealmFixture.User, `/api/v1/user/catalog/products/${sku}`, {
    sku, name: sku, description: 'Commerce browser fixture', brand: 'Fixture', category: 'Fixture', images: [],
    variants: [{ sku, name: sku, availableQuantity: 8 }], price: { base: 100, effective: 100, priceVersion: 'v1' }, active: true,
  }, 'PUT');
  expect(product.status()).toBe(200);
  database(`INSERT INTO inventory_balances(variant_id,available_quantity,safety_stock) SELECT id,8,0 FROM product_variants WHERE sku='${sku}' ON CONFLICT(variant_id) DO UPDATE SET available_quantity=8,safety_stock=0;`);
  const registration = await page.request.post('/api/v1/customer/auth/register', { headers: { Origin: origin }, data: {
    email: `cfe-${randomUUID()}@example.test`, password, firstName: 'CFE', lastName: 'Fixture',
  } });
  expect(registration.status()).toBe(201);
  const address = await mutate(page, RealmFixture.Customer, '/api/v1/customer/me/addresses', {
    street: 'Fixture', number: '1', city: 'Fixture', province: 'Fixture', postalCode: '1000', isDefault: true,
  });
  expect(address.status()).toBe(200);
  const addressId = (await address.json()).data.id;
  expect((await mutate(page, RealmFixture.Customer, '/api/v1/customer/cart/items', { sku, quantity: 2 }, 'PUT')).status()).toBe(200);
  const result = await mutate(page, RealmFixture.Customer, '/api/v1/customer/checkout', { idempotencyKey: randomUUID(), addressId, currency: 'ARS' });
  expect(result.status()).toBe(200);
  const receipt = (await result.json()).data;
  expect(OrderStatus.fromWire(receipt.orderStatus)).toBe(OrderStatus.PendingPayment);
  expect(PaymentStatus.fromWire(receipt.paymentStatus)).toBe(PaymentStatus.Pending);
  expect(String(receipt.orderId)).toMatch(/^\d+$/);
  await page.goto('/login');
  await expect(page.getByRole('button', { name: AccessContext.User.label, exact: true })).toBeVisible();
  await page.getByRole('button', { name: AccessContext.User.label, exact: true }).click();
  await expect(page).toHaveURL(/\/user\/home$/);
  return String(receipt.orderId);
}

async function read(page: Page, id: string) {
  const response = await page.request.get(`/api/v1/user/orders/${id}`);
  expect(response.status()).toBe(200);
  return mapAdminOrder((await response.json()).data);
}
function footprint(id: string): string {
  return database(`SELECT json_build_object('balances',(SELECT json_agg(b ORDER BY b.variant_id) FROM inventory_balances b),
    'sales',(SELECT json_agg(l ORDER BY l.id) FROM inventory_ledger l WHERE l.actor='MP_ORDERS:${id}'));`);
}
function eventCount(id: string): number {
  return Number(database(`SELECT count(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=${id};`));
}
function fulfillmentRecords(id: string): string {
  return database(`SELECT json_build_object('shipments',(SELECT json_agg(s ORDER BY s.id) FROM shipments s WHERE s.order_id=${id}),
    'returns',(SELECT json_agg(r ORDER BY r.id) FROM returns r WHERE r.order_id=${id}),
    'events',(SELECT json_agg(e ORDER BY e.id) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=${id}));`);
}
async function paid(page: Page, id: string): Promise<void> {
  const providerId = database(`SELECT provider_order_id FROM mp_checkout_attempts WHERE order_id=${id} ORDER BY id DESC LIMIT 1;`);
  expect(providerId).toMatch(/^cfe-[\w-]+$/);
  expect((await page.request.post(`http://127.0.0.1:4302/fixture/orders/${providerId}/accredit`, {
    headers: { Authorization: 'Bearer cfe-local-provider-token' },
  })).status()).toBe(200);
  const requestId = randomUUID();
  const ts = String(Date.now());
  const signature = createHmac('sha256', 'cfe-local-webhook-secret').update(`id:${providerId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
  const notified = await page.request.post(`/api/v1/payments/mercadopago/orders/notifications?data.id=${providerId}&type=order`, {
    headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` }, data: {
      id: randomUUID(), type: 'order', action: 'order.processed', user_id: 'cfe-user', application_id: 'cfe-app', data: { id: providerId },
    },
  });
  expect(notified.status()).toBe(200);
  await expect.poll(async () => (await read(page, id)).fulfillmentEligibility).toBe(FulfillmentEligibility.Eligible);
  expect(database(`SELECT count(*) FROM inventory_ledger l JOIN inventory_reservations r ON r.id=l.reservation_id WHERE l.actor='MP_ORDERS:${id}' AND l.event_type='SALE' AND l.channel='WEB' AND l.quantity_delta=-2 AND r.quantity=2 AND r.status='CONSUMED';`)).toBe('1');
}
async function open(page: Page, id: string) {
  await page.goto('/user/orders');
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: id, exact: true }) });
  await expect(row).toBeVisible();
  return row;
}
async function advance(page: Page, id: string, transition: ShipmentTransition, state: ShipmentStatus): Promise<void> {
  const row = await open(page, id);
  if (transition.requiresTracking) await row.getByRole('textbox').fill('CFE fixture tracking');
  const response = page.waitForResponse((candidate) => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === `/api/v1/user/orders/${id}/shipments`);
  await row.getByRole('button', { name: transition.label, exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(row).toContainText(state.label);
  await page.reload();
  await expect(await open(page, id)).toContainText(state.label);
  expect((await read(page, id)).shipmentStatus).toBe(state);
}
async function delivered(page: Page, id: string): Promise<void> {
  await paid(page, id);
  await advance(page, id, ShipmentTransition.Packed, ShipmentStatus.Preparing);
  await advance(page, id, ShipmentTransition.Shipped, ShipmentStatus.Shipped);
  await advance(page, id, ShipmentTransition.Delivered, ShipmentStatus.Delivered);
}

test('CFE E01: real pending checkout offers no fulfillment controls and denies CUSTOMER writes', async ({ page }) => {
  const id = await checkout(page);
  const before = footprint(id);
  const records = fulfillmentRecords(id);
  const row = await open(page, id);
  await expect(row.getByRole('button')).toHaveCount(0);
  expect((await read(page, id)).fulfillmentEligibility).toBe(FulfillmentEligibility.OrderNotPaid);
  for (const command of [ShipmentTransition.Packed, ShipmentTransition.Shipped, ShipmentTransition.Delivered]) {
    expect((await mutate(page, RealmFixture.User, `/api/v1/user/orders/${id}/shipments`, { status: command.wire })).status()).toBe(400);
  }
  expect((await mutate(page, RealmFixture.User, `/api/v1/user/orders/${id}/rma`, { status: RmaTransition.Received.wire })).status()).toBe(400);
  await mutate(page, RealmFixture.User, '/api/v1/internal/auth/logout', {});
  expect((await mutate(page, RealmFixture.Customer, `/api/v1/user/orders/${id}/shipments`, { status: ShipmentTransition.Packed.wire })).status()).toBe(401);
  expect(eventCount(id)).toBe(0);
  expect(footprint(id)).toBe(before);
  expect(fulfillmentRecords(id)).toBe(records);
});

test('CFE E03/E09: signed provider observation reaches real worker and ordered browser transitions survive reload', async ({ page }) => {
  const id = await checkout(page);
  await paid(page, id);
  const before = footprint(id);
  await advance(page, id, ShipmentTransition.Packed, ShipmentStatus.Preparing);
  await advance(page, id, ShipmentTransition.Shipped, ShipmentStatus.Shipped);
  await advance(page, id, ShipmentTransition.Delivered, ShipmentStatus.Delivered);
  expect(eventCount(id)).toBe(3);
  expect(database(`SELECT count(*) FROM shipments WHERE order_id=${id} AND shipped_at IS NOT NULL AND delivered_at>=shipped_at;`)).toBe('1');
  expect(footprint(id)).toBe(before);
});

test('CFE E07: reception is durable once and deferred inspection never changes stock', async ({ page }) => {
  const id = await checkout(page);
  await delivered(page, id);
  const before = footprint(id);
  const row = await open(page, id);
  const response = page.waitForResponse((candidate) => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === `/api/v1/user/orders/${id}/rma`);
  await row.getByRole('button', { name: RmaTransition.Received.label, exact: true }).click();
  expect((await response).status()).toBe(200);
  await page.reload();
  await expect(await open(page, id)).toContainText(RmaStatus.ReturnReceived.label);
  await expect((await open(page, id)).getByRole('button')).toHaveCount(0);
  for (const command of [RmaTransition.Received, RmaTransition.Inspected, RmaTransition.Adjusted]) {
    expect((await mutate(page, RealmFixture.User, `/api/v1/user/orders/${id}/rma`, { status: command.wire })).status()).toBe(400);
  }
  expect(database(`SELECT count(*) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE r.order_id=${id} AND ri.quantity=2 AND ri.adjustment_ledger_id IS NULL;`)).toBe('1');
  expect(footprint(id)).toBe(before);
});

test('CFE E06/E08: committed response loss recovers by authoritative GET and session controls remain isolated', async ({ page }) => {
  const id = await checkout(page);
  await paid(page, id);
  const before = footprint(id);
  // Fault injection forwards the real HTTP command, waits for its commit, then
  // discards only the browser response. It does not stub the command or readback.
  const path = `/api/v1/user/orders/${id}/shipments`;
  await page.route(`**${path}`, async (route) => {
    const committed = await route.fetch();
    expect(committed.status()).toBe(200);
    await route.abort('failed');
  }, { times: 1 });
  const row = await open(page, id);
  const authoritativeReload = page.waitForResponse((candidate) =>
    candidate.request().method() === 'GET' && new URL(candidate.url()).pathname === '/api/v1/user/orders');
  await row.getByRole('button', { name: ShipmentTransition.Packed.label, exact: true }).click();
  expect((await authoritativeReload).status()).toBe(200);
  await expect(row).toContainText(ShipmentStatus.Preparing.label);
  await expect(row.getByRole('button', { name: ShipmentTransition.Shipped.label, exact: true })).toBeVisible();
  expect((await read(page, id)).shipmentStatus).toBe(ShipmentStatus.Preparing);
  expect((await mutate(page, RealmFixture.User, path, { status: ShipmentTransition.Packed.wire })).status()).toBe(400);
  expect(eventCount(id)).toBe(1);
  await advance(page, id, ShipmentTransition.Shipped, ShipmentStatus.Shipped);
  expect(eventCount(id)).toBe(2);
  expect(footprint(id)).toBe(before);
  await mutate(page, RealmFixture.User, '/api/v1/internal/auth/logout', {});
  await assertRealm(page, RealmFixture.User, 401);
  await assertRealm(page, RealmFixture.Customer);
  await page.reload();
  await expect(page).not.toHaveURL(/\/user\/orders$/);
});

test('CFE E02/E07 MockHttp only: malformed future states render Unknown safely without commands', async ({ page }) => {
  await uiLogin(page, cfeAdminEmail);
  const raw = 'UNRECOGNIZED_FUTURE_STATE';
  await page.route('**/api/v1/user/orders', (route) => route.fulfill({ json: { status: 200, data: [{
    id: 'unknown-fixture', orderStatus: raw, paymentStatus: raw, shipmentStatus: raw, rmaStatus: raw,
    fulfillmentEligibility: raw, shipmentAction: raw, rmaAction: raw, items: [],
  }] } }));
  await page.goto('/user/orders');
  const row = page.getByRole('row').filter({ hasText: 'unknown-fixture' });
  await expect(row).toContainText(ShipmentStatus.Unknown.label);
  await expect(row).not.toContainText(raw);
  await expect(row.getByRole('button')).toHaveCount(0);
});
