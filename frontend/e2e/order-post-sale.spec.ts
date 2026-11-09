import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { OrderStatus } from '../src/app/domain/order/commerce-states';
import { OrderFactState } from '../src/app/domain/order/order-projection';
import { ReturnEligibility } from '../src/app/domain/order/return-eligibility';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const unavailable = { state: 'UNAVAILABLE', value: null, reason: 'SOURCE_MISSING' };
const detail = {
  id: '101', orderNumber: 'ORD-101', createdAt: '2026-11-08T10:00:00Z', updatedAt: '2026-11-08T11:00:00Z',
  orderStatus: 'PAID', paymentStatus: 'APPROVED', shipmentStatus: 'DELIVERED', tracking: null,
  rmaStatus: 'NONE', fulfillmentEligibility: 'ELIGIBLE', shipmentAction: null, rmaAction: 'RECEIVED',
  currency: 'ARS', subtotal: 90, shippingCost: 10, total: 100,
  lines: [{ sku: 'SKU-101', name: 'Producto histórico', quantity: 1, originalUnitPrice: 90, effectiveUnitPrice: 90, discountAmount: 0 }],
  buyerName: unavailable, buyerEmail: unavailable, payment: { state: 'KNOWN', value: 'APPROVED', reason: null },
  delivery: { state: 'KNOWN', value: { recipient: null, street: 'Calle 123', city: 'Ciudad', province: 'Provincia', postalCode: '1234', country: null }, reason: null },
  timeline: { state: 'KNOWN', value: [{ id: 'event-1', kind: 'ORDER_CREATED', occurredAt: '2026-11-08T10:00:00Z', actor: 'INTERNAL-SECRET', payload: 'RAW-SECRET' }], reason: null },
  returnEligibility: 'ELIGIBLE',
};

async function mockSession(page: Page, realm: 'customer' | 'user', reads: URL[], methods: string[]): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/customer/me') && realm === 'customer') return route.fulfill({ json: envelope({ id: 'customer-1', email: 'current@example.com', firstName: 'Actual', lastName: 'Cuenta' }) });
    if (path.endsWith('/internal/me') && realm === 'user') return route.fulfill({ json: envelope({ id: 'operator-1', roles: ['OPERATOR'] }) });
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'csrf' } });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    if (path.includes('/orders')) {
      reads.push(url); methods.push(route.request().method());
      if (!path.includes('/' + realm + '/orders')) return route.fulfill({ status: 403, json: {} });
      if (path.endsWith('/101')) return route.fulfill({ json: envelope(detail) });
      const second = url.searchParams.get('page') === '1';
      const item = second ? { ...detail, id: '102', orderStatus: 'UNKNOWN', paymentStatus: 'UNKNOWN', payment: { state: 'UNAVAILABLE', value: null, reason: 'SOURCE_CONTRADICTORY' } } : detail;
      return route.fulfill({ json: envelope({ items: [item], page: second ? 1 : 0, size: 25, total: 26, truncated: !second }) });
    }
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
}

for (const width of [390, 768, 1440]) {
  test(`customer order paging, safe post-sale facts and accessibility at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const reads: URL[] = []; const methods: string[] = [];
    await mockSession(page, 'customer', reads, methods);
    await page.goto('/customer/orders');
    await expect(page.getByRole('link', { name: '101', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByRole('link', { name: '102', exact: true })).toBeVisible();
    expect(reads.at(-1)?.searchParams.get('page')).toBe('1');
    await expect(page.getByText('pago ' + OrderFactState.Unavailable.label, { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Estado de orden', exact: true }).selectOption({ label: OrderStatus.Paid.label });
    await expect(page.getByRole('link', { name: '101', exact: true })).toBeVisible();
    expect(reads.at(-1)?.searchParams.get('orderStatus')).toBe(OrderStatus.Paid.wire);
    expect(reads.at(-1)?.searchParams.get('page')).toBe('0');
    await page.getByRole('link', { name: '101', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Orden 101', exact: true })).toBeVisible();
    await expect(page.getByText(ReturnEligibility.Eligible.label, { exact: true })).toBeVisible();
    await expect(page.getByText('Calle 123', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('INTERNAL-SECRET');
    await expect(page.locator('body')).not.toContainText('RAW-SECRET');
    await expect(page.locator('body')).not.toContainText('current@example.com');
    await expect(page.getByRole('button', { name: /devolución|RMA|recibido/i })).toHaveCount(0);
    expect(reads.every((url) => url.pathname.includes('/customer/orders'))).toBe(true);
    expect(methods.every((method) => method === 'GET')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  });
}

test('operator order pages use USER reads and preserve safe detail projection', async ({ page }) => {
  const reads: URL[] = []; const methods: string[] = [];
  await mockSession(page, 'user', reads, methods);
  await page.goto('/user/orders');
  await expect(page.getByRole('link', { name: '101', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByRole('link', { name: '102', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await page.getByRole('link', { name: '101', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fulfillment 101', exact: true })).toBeVisible();
  await expect(page.getByText('ORD-101', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('INTERNAL-SECRET');
  expect(reads.every((url) => url.pathname.includes('/user/orders'))).toBe(true);
  expect(methods.every((method) => method === 'GET')).toBe(true);
});
