import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { DemoCommerce, DemoProductVariant, DemoScenario, demoSeed, type DemoSnapshot } from '../src/app/demo/demo-model';
import { DemoDeliveryMethod, DemoPaymentMethod } from '../src/app/demo/demo-process-types';
import { DemoResultOutcome as Outcome } from '../src/app/demo/checkout/demo-checkout-result';
import { OrderStatus, PaymentStatus, ShipmentStatus } from '../src/app/domain/order/commerce-states';

const cta = (page: Page, id: string) => page.locator(`[data-cta="${id}"]`);
function fixture(scenario = DemoScenario.Approved, delivery = DemoDeliveryMethod.Home) { const commerce = new DemoCommerce(demoSeed(), () => '2026-10-28T12:00:00Z', () => 'SC12A'); commerce.add('cliente', 'DEMO-001', 2, DemoProductVariant.Case); const order = commerce.checkout('cliente', 'SC12A', 'address-cliente', scenario, DemoPaymentMethod.Card, delivery); return { snapshot: commerce.snapshot, order }; }
async function login(page: Page) { await page.goto('/demo/login'); await page.getByLabel('Contraseña', { exact: true }).fill('demo'); await cta(page, 'login-submit').click(); await cta(page, 'login-customer').click(); }
async function open(page: Page, snapshot: DemoSnapshot, id: string) { await page.goto('/demo/login'); await page.evaluate(raw => { localStorage.setItem('storecore.commercial-demo.v1', raw); sessionStorage.clear(); }, JSON.stringify(snapshot)); await login(page); await page.goto('/demo/checkout/result/'+id); }
async function storage(page: Page) { return page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })); }

test('SC12A new coherent outcomes use persisted facts; shell/query/reload never decide payment or mutate storage', async ({ page }) => {
  for (const entry of [{ scenario: DemoScenario.Approved, outcome: Outcome.Approved, shipment: ShipmentStatus.Preparing }, { scenario: DemoScenario.Pending, outcome: Outcome.Pending, shipment: ShipmentStatus.Pending }, { scenario: DemoScenario.Rejected, outcome: Outcome.Rejected, shipment: ShipmentStatus.Cancelled }]) {
    const { snapshot, order } = fixture(entry.scenario); await open(page, snapshot, order.id); const before = await storage(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.outcome.title); await expect(page.locator('.result-facts')).toContainText(entry.shipment.label);
    await cta(page, 'shell-scenario').selectOption(DemoScenario.Approved.wire); await page.goto(page.url()+'?outcome=approved'); await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.outcome.title); expect(await storage(page)).toEqual(before);
    await expect(page.locator('[data-cta^="order-payment-"]')).toHaveCount(0); await expect(page.locator('.result-line')).toContainText(DemoProductVariant.Case.label);
    await cta(page, 'result-view-order').click(); await expect(page).toHaveURL(new RegExp('/demo/customer/orders/'+order.id+'$')); expect(await storage(page)).toEqual(before);
  }
});

test('SC12A pending decisions remain explicit in order detail and update coherent shipment', async ({ page }) => {
  const { snapshot, order } = fixture(DemoScenario.Pending); await open(page, snapshot, order.id); await cta(page, 'result-view-order').click();
  await cta(page, 'shell-scenario').selectOption(DemoScenario.Approved.wire); await cta(page, 'order-payment-resolve').click(); await expect(page.locator('main')).toContainText(ShipmentStatus.Preparing.label);
  await page.goto('/demo/checkout/result/'+order.id); await expect(page.getByRole('heading', { level: 1 })).toHaveText(Outcome.Approved.title);
  const cancelled = fixture(DemoScenario.Pending); await open(page, cancelled.snapshot, cancelled.order.id); await cta(page, 'result-view-order').click(); await cta(page, 'order-payment-cancel').click(); await cta(page, 'operation-confirm').click();
  await page.goto('/demo/checkout/result/'+cancelled.order.id); await expect(page.getByRole('heading', { level: 1 })).toHaveText(Outcome.Cancelled.title); await expect(page.locator('.result-facts')).not.toContainText(ShipmentStatus.Preparing.label);
});

test('SC12A missing and foreign orders are indistinguishable and guest/admin cannot read buyer facts', async ({ page }) => {
  const snapshot = demoSeed(); await open(page, snapshot, 'DEMO-102'); const foreign = await page.locator('.result-page').innerText(); await expect(page.locator('.result-line')).toHaveCount(0);
  await page.goto('/demo/checkout/result/missing'); expect(await page.locator('.result-page').innerText()).toBe(foreign);
  await cta(page, 'shell-logout').click(); await page.goto('/demo/checkout/result/DEMO-100'); await expect(page.locator('.result-facts')).toHaveCount(0); await cta(page, 'result-login').click();
  expect(new URL(page.url()).searchParams.get('returnUrl')).toBe('/demo/checkout/result/DEMO-100');
  await page.getByLabel('Contraseña', { exact: true }).fill('demo'); await cta(page, 'login-submit').click(); await cta(page, 'login-admin').click(); await page.goto('/demo/checkout/result/DEMO-100'); await expect(page.locator('.result-facts')).toHaveCount(0);
});

test('SC12A legacy inconsistencies, unknown and reversed facts never claim finality/tracking or rewrite history', async ({ page }) => {
  const cases = [
    { payment: PaymentStatus.Pending, status: OrderStatus.PendingPayment, shipment: ShipmentStatus.Preparing, outcome: Outcome.Review },
    { payment: PaymentStatus.Unknown, status: OrderStatus.Paid, shipment: ShipmentStatus.Shipped, outcome: Outcome.Unknown },
    { payment: PaymentStatus.Refunded, status: OrderStatus.Refunded, shipment: ShipmentStatus.Delivered, outcome: Outcome.Review },
    { payment: PaymentStatus.ChargedBack, status: OrderStatus.Paid, shipment: ShipmentStatus.Delivered, outcome: Outcome.Review },
  ];
  for (const entry of cases) {
    const { snapshot, order } = fixture(entry.payment === PaymentStatus.Pending ? DemoScenario.Pending : DemoScenario.Approved); Object.assign(order, { payment: entry.payment, status: entry.status, shipment: entry.shipment }); order.tracking = 'SIM-historic';
    await open(page, snapshot, order.id); const before = await storage(page); await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.outcome.title);
    await expect(page.getByText('Seguimiento postal simulado disponible en el detalle del pedido.', { exact: true })).toHaveCount(0); await page.reload(); expect(await storage(page)).toEqual(before);
  }
  const legacy = fixture(); delete legacy.order.delivery; legacy.order.lines = [{ sku: 'DEMO-001', name: 'Historical line', unit: 100, quantity: 2 }]; legacy.order.total = 100;
  await open(page, legacy.snapshot, legacy.order.id); const before = await storage(page); await expect(page.getByRole('heading', { level: 1 })).toHaveText(Outcome.Review.title); await expect(page.locator('main')).toContainText('No inferimos entrega gratuita'); expect(await storage(page)).toEqual(before);
});

test('SC12A pickup and unknown historical fee are not presented as postal service or free shipping', async ({ page }) => {
  const pickup = fixture(DemoScenario.Approved, DemoDeliveryMethod.Pickup); pickup.order.tracking = 'LEGACY-postal'; await open(page, pickup.snapshot, pickup.order.id);
  await expect(page.locator('main')).toContainText(DemoDeliveryMethod.Pickup.label); await expect(page.getByText('Seguimiento postal simulado disponible en el detalle del pedido.', { exact: true })).toHaveCount(0);
  const legacy = fixture(); delete legacy.order.delivery; await open(page, legacy.snapshot, legacy.order.id); await expect(page.locator('main')).toContainText('Costo de entrega no informado por separado');
});

for (const width of [320, 390, 768, 900, 1440]) {
  test(`SC12A responsive, keyboard and Axe ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); const { snapshot, order } = fixture(DemoScenario.Pending); await open(page, snapshot, order.id);
    await cta(page, 'result-view-order').focus(); await page.keyboard.press('Tab'); await expect(cta(page, 'result-catalog')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`result-pending-${width}.png`), fullPage: true });
    await cta(page, 'result-view-order').click(); await expect(page.locator('main h1')).toBeVisible();
  });
}
