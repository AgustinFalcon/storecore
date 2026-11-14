import { DeliveryMode, DeliveryQuote } from '../src/app/domain/cart/delivery';
import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { mapAdminOrder } from '../src/app/data/mappers/http-mappers';
import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from '../src/app/domain/order/commerce-states';
import { DamageReason, ReturnDispositionState } from '../src/app/domain/order/return-disposition';
import { mapReturnDisposition } from '../src/app/data/order/return-disposition.mapper';
import { AccessContext, RealmFixture, apiLogin, assertRealm, chooseExisting, database, origin, password, uiLogin } from './support/fixtures';

enum FixtureModule { Storefront = 'STOREFRONT', Catalog = 'CATALOG', Payments = 'PAYMENTS_MP', Fulfillment = 'MANUAL_FULFILLMENT', Profile = 'PROFILE_CONTENT' }
enum FixtureCapabilityState { Active = 'ACTIVE' }
enum FixtureLedgerEvent { RmaRestock = 'RMA_RESTOCK' }
const cfeAdminEmail = 'cfe-user-admin@example.test';
const rmaAdminEmail = 'cfe-rma-admin@example.test';
const malformedStateAdminEmail = 'cfe-malformed-admin@example.test';
const pickupAdminEmail = 'cfe-pickup-admin@example.test';

interface CheckoutFixtureOptions {
  readonly userEmail?: string;
  readonly mode?: DeliveryMode;
}

async function mutate(page: Page, realm: RealmFixture, path: string, data: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<APIResponse> {
  const csrf = await page.request.get(`/api/v1/${realm.path}/auth/csrf`);
  expect(csrf.status()).toBe(200);
  return page.request.fetch(path, { method, headers: { Origin: origin, 'X-CSRF-Token': csrf.headers()['x-csrf-token']! }, data });
}

async function checkout(page: Page, options: CheckoutFixtureOptions = {}): Promise<string> {
  const userEmail = options.userEmail ?? cfeAdminEmail;
  const mode = options.mode ?? DeliveryMode.LocalDelivery;
  await apiLogin(page, userEmail);
  for (const module of Object.values(FixtureModule)) {
    database(`SELECT capability_session_change_configuration(u.id,s.id,'${module}',m.config_version,'${FixtureCapabilityState.Active}',m.config,'${randomUUID()}'::uuid,'CFE browser fixture')
      FROM users u JOIN identity_sessions s ON s.user_id=u.id AND s.subject_kind='USER' AND s.revoked_at IS NULL
      CROSS JOIN module_configurations m WHERE u.email='${userEmail}' AND m.module_code='${module}'
        AND (m.state<>'${FixtureCapabilityState.Active}' )
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
  if (mode.requiresAddress) {
    const address = await mutate(page, RealmFixture.Customer, '/api/v1/customer/me/addresses', {
      street: 'Fixture', number: '1', city: 'Fixture', province: 'Fixture', postalCode: '1000', isDefault: true,
    });
    expect(address.status()).toBe(200);
  }
  expect((await mutate(page, RealmFixture.Customer, '/api/v1/customer/cart/items', { sku, quantity: 2 }, 'PUT')).status()).toBe(200);
  const cartResponse = await page.request.get('/api/v1/customer/cart');
  const cart = (await cartResponse.json()).data;
  const delivery = DeliveryQuote.listFromWire(cart.deliveryOptions).find(option => option.mode === mode);
  expect(delivery?.known).toBe(true);
  if (!delivery || delivery.cost === null) throw new Error(`Missing real delivery quote for ${mode.wire}`);
  if (mode === DeliveryMode.LocalDelivery) expect(delivery.cost).toBeGreaterThan(0);
  await chooseExisting(page, RealmFixture.Customer);
  await page.goto('/checkout');
  const selectedMode = page.getByRole('radio', { name: new RegExp(delivery.label) });
  await expect(selectedMode).toBeVisible();
  await selectedMode.check();
  const expectedTotal = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(200 + delivery.cost);
  await expect(page.locator('.sc-summary')).toContainText(expectedTotal);
  const checkoutResponse = page.waitForResponse(candidate => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === '/api/v1/customer/checkout');
  await page.getByRole('button', { name: 'Pagar', exact: true }).click();
  const result = await checkoutResponse;
  expect(result.status()).toBe(200);
  const receipt = (await result.json()).data;
  expect(OrderStatus.fromWire(receipt.orderStatus)).toBe(OrderStatus.PendingPayment);
  expect(PaymentStatus.fromWire(receipt.paymentStatus)).toBe(PaymentStatus.Pending);
  expect(String(receipt.orderId)).toMatch(/^\d+$/);
  await expect(page).toHaveURL(new RegExp(`/checkout/result/${receipt.orderId}$`));
  expect(database(`SELECT count(*) FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=${receipt.orderId} AND o.shipping_cost=${delivery.cost.toFixed(2)} AND o.total=o.subtotal+o.shipping_cost AND p.amount=o.total;`)).toBe('1');
  await page.evaluate(() => localStorage.removeItem('storecore.active-context'));
  await page.reload();
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

test('delivery decision: real pickup needs no address, records history, completes collection and enables RMA', async ({ page }) => {
  test.setTimeout(90_000);
  const id = await checkout(page, { userEmail: pickupAdminEmail, mode: DeliveryMode.Pickup });
  expect(database(`SELECT count(*) FROM customer_addresses a JOIN orders o ON o.customer_id=a.customer_id WHERE o.id=${id};`)).toBe('0');
  expect(database(`SELECT count(*) FROM orders WHERE id=${id} AND shipping_cost=0 AND checkout_snapshot->'delivery'->>'mode'='${DeliveryMode.Pickup.wire}';`)).toBe('1');
  await paid(page, id);
  await advance(page, id, ShipmentTransition.Packed, ShipmentStatus.Preparing);
  await advance(page, id, ShipmentTransition.ReadyForPickup, ShipmentStatus.ReadyForPickup);
  await advance(page, id, ShipmentTransition.PickedUp, ShipmentStatus.PickedUp);
  await page.goto(`/user/orders/${id}`);
  await expect(page.getByRole('heading', { name: `Fulfillment ${id}`, exact: true })).toBeVisible();
  await expect(page.getByText('Retiro fixture', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Listo para retirar' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Retiro confirmado' })).toBeVisible();
  const rma = page.getByRole('button', { name: RmaTransition.Received.label, exact: true });
  await expect(rma).toBeVisible();
  const response = page.waitForResponse(candidate => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === `/api/v1/user/orders/${id}/rma`);
  await rma.click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText(`rma ${RmaStatus.ReturnReceived.label}`, { exact: true })).toBeVisible();
  expect((await read(page, id)).rmaStatus).toBe(RmaStatus.ReturnReceived);
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

test('RMA: real mixed inspection commits once and a lost response recovers through GET and reload', async ({ page }) => {
  test.setTimeout(90_000);
  const id = await checkout(page, { userEmail: rmaAdminEmail });
  await delivered(page, id);
  const row = await open(page, id);
  const reception = page.waitForResponse(candidate => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === `/api/v1/user/orders/${id}/rma`);
  await row.getByRole('button', { name: RmaTransition.Received.label, exact: true }).click();
  expect((await reception).status()).toBe(200);
  const balance = () => Number(database(`SELECT b.available_quantity FROM inventory_balances b JOIN order_items oi ON oi.variant_id=b.variant_id WHERE oi.order_id=${id};`));
  const before = balance();
  const path = `/api/v1/user/orders/${id}/return-disposition`;
  await page.goto(`/user/orders/${id}`);
  const inspection = page.locator('sc-return-disposition-view');
  await expect(inspection.getByRole('heading', { name: 'Clasificar unidades', exact: true })).toBeVisible();
  await inspection.getByRole('spinbutton', { name: 'Aptas para reponer', exact: true }).fill('1');
  await inspection.getByRole('spinbutton', { name: 'Dañadas', exact: true }).fill('1');
  await inspection.getByRole('combobox', { name: 'Motivo de daño (obligatorio)', exact: true }).selectOption({ label: DamageReason.Cosmetic.label });
  await inspection.getByRole('button', { name: 'Revisar clasificación', exact: true }).click();
  await expect(inspection.getByRole('heading', { name: 'Revisar antes de confirmar', exact: true })).toBeVisible();
  await expect(inspection.getByLabel('Resumen de impacto')).toContainText('+1 unidades vendibles');
  // Forward the actual command and discard only its response after commit.
  // All positive reads and writes still reach Spring/PostgreSQL.
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    const committed = await route.fetch();
    expect(committed.status()).toBe(200);
    expect(mapReturnDisposition((await committed.json()).data).state).toBe(ReturnDispositionState.Confirmed);
    await route.abort('failed');
  });
  await inspection.getByRole('button', { name: 'Confirmar inspección y reposición', exact: true }).click();
  await expect(inspection.getByRole('heading', { name: 'Resultado pendiente de comprobar', exact: true })).toBeVisible();
  expect(balance()).toBe(before + 1);
  const recovery = page.waitForResponse(candidate => candidate.request().method() === 'GET' && new URL(candidate.url()).pathname === path);
  await inspection.getByRole('button', { name: 'Consultar resultado', exact: true }).click();
  expect((await recovery).status()).toBe(200);
  await expect(inspection.getByRole('heading', { name: 'Inspección confirmada', exact: true })).toBeVisible();
  await expect(page.getByText(`rma ${RmaStatus.Closed.label}`, { exact: true })).toBeVisible();
  await expect(inspection.getByRole('spinbutton')).toHaveCount(0);
  await page.unroute(`**${path}`);
  await page.reload();
  await expect(inspection.getByRole('heading', { name: 'Inspección confirmada', exact: true })).toBeVisible();
  expect((await read(page, id)).rmaStatus).toBe(RmaStatus.Closed);
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  const result = mapReturnDisposition((await response.json()).data);
  expect(result.state).toBe(ReturnDispositionState.Confirmed);
  expect(result.lines[0].classification?.restockQuantity).toBe(1);
  expect(result.lines[0].classification?.damagedQuantity).toBe(1);
  expect(result.lines[0].classification?.damageReason).toBe(DamageReason.Cosmetic);
  expect(balance()).toBe(before + 1);
  expect(database(`SELECT count(*) FROM rma_disposition_commands c JOIN returns r ON r.id=c.return_id WHERE r.order_id=${id};`)).toBe('1');
  expect(database(`SELECT count(*) FROM inventory_ledger l JOIN return_items ri ON ri.adjustment_ledger_id=l.id JOIN returns r ON r.id=ri.return_id WHERE r.order_id=${id} AND l.event_type='${FixtureLedgerEvent.RmaRestock}' AND l.quantity_delta=1;`)).toBe('1');
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
  await uiLogin(page, malformedStateAdminEmail);
  const raw = 'UNRECOGNIZED_FUTURE_STATE';
  await page.route((url) => url.pathname === '/api/v1/user/orders', (route) => route.fulfill({ json: { code: 200, data: { items: [{
    id: 'unknown-fixture', orderStatus: raw, paymentStatus: raw, shipmentStatus: raw, rmaStatus: raw,
    fulfillmentEligibility: raw, shipmentAction: raw, rmaAction: raw, lines: [],
  }], page: 0, size: 25, total: 1, truncated: false } } }));
  const mockedRead = page.waitForResponse((candidate) =>
    candidate.request().method() === 'GET' && new URL(candidate.url()).pathname === '/api/v1/user/orders');
  await page.goto('/user/orders');
  expect((await mockedRead).status()).toBe(200);
  const row = page.getByRole('row').filter({ hasText: 'unknown-fixture' });
  await expect(row).toContainText(ShipmentStatus.Unknown.label);
  await expect(row).not.toContainText(raw);
  await expect(row.getByRole('button')).toHaveCount(0);
});
