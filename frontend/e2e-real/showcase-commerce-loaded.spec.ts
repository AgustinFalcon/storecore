import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { database } from './support/fixtures';
import { CommerceDispositionState, CommercePaymentState, CommerceShipmentState } from './support/commerce-states';

interface ScenarioReceipt {
  readonly key: string; readonly orderId: string; readonly sku: string; readonly quantity: number;
  readonly deliveryMode: string; readonly paymentStatus: string; readonly shipmentStatus: string; readonly rmaStatus: string; readonly total: string;
}
interface CommerceReceipt { readonly schemaVersion: number; readonly evidence: string; readonly scenarios: readonly ScenarioReceipt[]; readonly digest: string; }

function receipt(): CommerceReceipt {
  const path = process.env['STORECORE_SHOWCASE_COMMERCE_RECEIPT'];
  if (!path) throw new Error('STORECORE_SHOWCASE_COMMERCE_RECEIPT_REQUIRED');
  const value = JSON.parse(readFileSync(path, 'utf8')) as CommerceReceipt;
  expect(value.schemaVersion).toBe(1);
  expect(value.evidence).toBe('REAL_BACKEND_LOCAL_PROVIDER');
  expect(value.scenarios).toHaveLength(9);
  expect(new Set(value.scenarios.map(row => row.orderId)).size).toBe(9);
  expect(value.scenarios.every(row => /^\d+$/.test(row.orderId))).toBe(true);
  return value;
}

async function login(page: Page, realm: 'customer' | 'internal', email: string, password: string): Promise<void> {
  const response = await page.request.post(`/api/v1/${realm}/auth/login`, { headers: { Origin: 'https://localhost:4301' }, data: { email, password } });
  expect(response.status()).toBe(200);
}

test('full ferreteria catalog, merchandising and shopper surfaces render populated data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Herramientas para hacer el trabajo bien', exact: true })).toBeVisible();
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(page.getByText('Amoladora angular 850W 115 mm', { exact: true }).first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Búsqueda', exact: true }).fill('Taladro percutor');
  await page.getByRole('main').getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText('Taladro percutor inalámbrico 18V', { exact: true }).first()).toBeVisible();
  const [first, second] = await Promise.all([page.request.get('/api/v1/catalog?page=0&size=50'), page.request.get('/api/v1/catalog?page=1&size=50')]);
  expect(first.status()).toBe(200); expect(second.status()).toBe(200);
  const pages = [(await first.json()).data, (await second.json()).data];
  expect(pages[0].total).toBe(80);
  expect(pages.flatMap(value => value.items)).toHaveLength(80);
});

test('buyer sees all nine real orders and every populated detail survives reload', async ({ page }) => {
  const data = receipt();
  await login(page, 'customer', 'showcase.commerce@storecore.invalid', 'StoreCore-commerce-2026!');
  const orders = await page.request.get('/api/v1/customer/orders?page=0&size=25');
  expect(orders.status()).toBe(200);
  const body = (await orders.json()).data;
  expect(body.total).toBe(9);
  expect(new Set(body.items.map((row: { id: string }) => String(row.id)))).toEqual(new Set(data.scenarios.map(row => row.orderId)));
  await page.goto('/customer/orders');
  await expect(page.getByRole('heading', { name: 'Mis órdenes', exact: true })).toBeVisible();
  for (const scenario of data.scenarios) {
    await page.goto(`/customer/orders/${scenario.orderId}`);
    await expect(page.getByRole('heading', { name: `Orden ${scenario.orderId}`, exact: true })).toBeVisible();
    const detail = await page.request.get(`/api/v1/customer/orders/${scenario.orderId}`);
    expect(detail.status()).toBe(200);
    const line = (await detail.json()).data.lines.find((row: { sku: string }) => row.sku === scenario.sku);
    expect(line).toBeDefined();
    await expect(page.getByRole('cell', { name: line.name, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: `Orden ${scenario.orderId}`, exact: true })).toBeVisible();
  }
});

test('administrator sees exact operational distribution and actionable queue', async ({ page }) => {
  const data = receipt();
  await login(page, 'internal', 'cfe-user-admin@example.test', 'ua-fixture-password-2026');
  const response = await page.request.get('/api/v1/user/orders?page=0&size=50');
  expect(response.status()).toBe(200);
  const owned = (await response.json()).data.items.filter((row: { id: string }) => data.scenarios.some(scenario => scenario.orderId === String(row.id)));
  expect(owned).toHaveLength(9);
  expect(owned.filter((row: { paymentStatus: string }) => CommercePaymentState.fromWire(row.paymentStatus) === CommercePaymentState.Approved)).toHaveLength(8);
  expect(owned.filter((row: { shipmentStatus: string }) => CommerceShipmentState.fromWire(row.shipmentStatus) === CommerceShipmentState.Pending)).toHaveLength(2);
  expect(owned.filter((row: { shipmentStatus: string }) => CommerceShipmentState.fromWire(row.shipmentStatus) === CommerceShipmentState.Delivered)).toHaveLength(3);
  expect(owned.filter((row: { shipmentStatus: string }) => CommerceShipmentState.fromWire(row.shipmentStatus) === CommerceShipmentState.ReadyForPickup)).toHaveLength(1);
  expect(owned.filter((row: { shipmentStatus: string }) => CommerceShipmentState.fromWire(row.shipmentStatus) === CommerceShipmentState.PickedUp)).toHaveLength(1);
  await page.goto('/user/orders');
  await expect(page.getByRole('heading', { name: 'Fulfillment', exact: true })).toBeVisible();
  for (const scenario of data.scenarios) await expect(page.getByText(scenario.orderId, { exact: true }).first()).toBeVisible();
});

test('inventory, offers and overview expose the same loaded business graph', async ({ page }) => {
  const data = receipt();
  await login(page, 'internal', 'cfe-user-admin@example.test', 'ua-fixture-password-2026');
  const [inventory, offers, ...overviews] = await Promise.all([
    page.request.get('/api/v1/user/inventory?page=0&size=50'),
    page.request.get('/api/v1/user/offers'),
    ...['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS'].map(period => page.request.get(`/api/v1/user/overview?period=${period}`)),
  ]);
  expect(inventory.status()).toBe(200); expect(offers.status()).toBe(200);
  for (const overview of overviews) expect(overview.status()).toBe(200);
  const inventoryPage = (await inventory.json()).data;
  expect(inventoryPage.total).toBeGreaterThanOrEqual(80);
  expect(inventoryPage.items).toHaveLength(50);
  expect((await offers.json()).data.length).toBe(12);
  const expectedRevenue = data.scenarios.filter(row => CommercePaymentState.fromWire(row.paymentStatus) === CommercePaymentState.Approved).reduce((sum, row) => sum + Number(row.total), 0);
  const commercePending = data.scenarios.find(row => row.key === 'pending-payment')!.orderId;
  const activeKeys = new Set(['paid-awaiting-preparation', 'preparing', 'shipped', 'ready-for-pickup']);
  const expectedFulfillment = new Set(data.scenarios.filter(row => activeKeys.has(row.key)).map(row => row.orderId));
  for (const response of overviews) {
    const facts = (await response.json()).data;
    expect(facts.accreditedRevenue).toMatchObject({ state: 'KNOWN', value: expectedRevenue });
    expect(facts.orderCount).toMatchObject({ state: 'KNOWN', value: 10 });
    expect(facts.pendingPayments.totalCount).toBe(2);
    expect(new Set(facts.pendingPayments.items.map((row: { orderId: number }) => String(row.orderId))).has(commercePending)).toBe(true);
    expect(facts.fulfillment.totalCount).toBe(4);
    expect(new Set(facts.fulfillment.items.map((row: { orderId: number }) => String(row.orderId)))).toEqual(expectedFulfillment);
  }
  await page.goto('/user/inventory');
  await expect(page.getByRole('heading', { name: 'Inventario WEB', exact: true })).toBeVisible();
  await page.goto('/user/home');
  await expect(page.getByRole('heading', { name: 'Resumen operativo', exact: true })).toBeVisible();
});

test('mixed return is confirmed once and only one unit returns to sellable stock', async ({ page }) => {
  const scenario = receipt().scenarios.find(row => row.key === 'return-closed-mixed');
  expect(scenario).toBeDefined();
  await login(page, 'internal', 'cfe-user-admin@example.test', 'ua-fixture-password-2026');
  const disposition = await page.request.get(`/api/v1/user/orders/${scenario!.orderId}/return-disposition`);
  expect(disposition.status()).toBe(200);
  const value = (await disposition.json()).data;
  expect(CommerceDispositionState.fromWire(value.state)).toBe(CommerceDispositionState.Confirmed);
  expect(value.lines).toHaveLength(1);
  expect(value.lines[0]).toMatchObject({ quantity: 3, restockQuantity: 1, damagedQuantity: 1, rejectedQuantity: 1, damageReason: 'COSMETIC', rejectionReason: 'INCOMPLETE_RETURN' });
  await page.goto(`/user/orders/${scenario!.orderId}`);
  await expect(page.getByRole('heading', { name: `Fulfillment ${scenario!.orderId}`, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inspección confirmada', exact: true })).toBeVisible();
});

test('database authority graph has exact scoped counts and quantities', () => {
  const ids = receipt().scenarios.map(row => row.orderId).join(',');
  expect(database(`SELECT count(*) FROM orders WHERE id IN (${ids});`)).toBe('9');
  expect(database(`SELECT count(*) FROM payments WHERE order_id IN (${ids});`)).toBe('9');
  expect(database(`SELECT count(*) FROM payments WHERE order_id IN (${ids}) AND status='${CommercePaymentState.Approved.wire}';`)).toBe('8');
  expect(database(`SELECT count(*) FROM mp_checkout_attempts WHERE order_id IN (${ids});`)).toBe('9');
  expect(database(`SELECT count(*) FROM mp_order_commercial_applications WHERE order_id IN (${ids}) AND transition='PAYMENT_ACCREDITED';`)).toBe('8');
  expect(database(`SELECT count(*)||':'||coalesce(sum(r.quantity),0) FROM inventory_reservations r JOIN orders o ON r.reservation_saga_key=(o.checkout_snapshot->>'reservationSagaKey')::uuid WHERE o.id IN (${ids}) AND r.status='CONSUMED';`)).toBe('8:17');
  expect(database(`SELECT count(*)||':'||coalesce(sum(r.quantity),0) FROM inventory_reservations r JOIN orders o ON r.reservation_saga_key=(o.checkout_snapshot->>'reservationSagaKey')::uuid WHERE o.id IN (${ids}) AND r.status='ACTIVE';`)).toBe('1:2');
  expect(database(`SELECT count(*)||':'||coalesce(sum(quantity_delta),0) FROM inventory_ledger WHERE actor IN (${ids.split(',').map(id => `'MP_ORDERS:${id}'`).join(',')}) AND event_type='SALE';`)).toBe('8:-17');
  expect(database(`SELECT count(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id IN (${ids});`)).toBe('17');
  expect(database(`SELECT string_agg(status||':'||amount,',' ORDER BY status) FROM (SELECT status,count(*) amount FROM shipments WHERE order_id IN (${ids}) GROUP BY status) grouped;`)).toBe('DELIVERED:3,PENDING:2,PICKED_UP:1,PREPARING:1,READY_FOR_PICKUP:1,SHIPPED:1');
  expect(database(`SELECT count(*) FROM returns WHERE order_id IN (${ids});`)).toBe('2');
  expect(database(`SELECT count(*) FROM rma_disposition_commands c JOIN returns r ON r.id=c.return_id WHERE r.order_id IN (${ids});`)).toBe('1');
  expect(database(`SELECT count(*)||':'||coalesce(sum(l.quantity_delta),0) FROM inventory_ledger l JOIN return_items i ON i.adjustment_ledger_id=l.id JOIN returns r ON r.id=i.return_id WHERE r.order_id IN (${ids}) AND l.event_type='RMA_RESTOCK';`)).toBe('1:1');
});
