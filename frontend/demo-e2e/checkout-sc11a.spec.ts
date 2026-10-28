import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { DemoDeliveryMethod as Method } from '../src/app/demo/demo-process-types';
import { DemoPaymentPhase } from '../src/app/demo/demo-process-types';
import { DemoProductVariant as Variant } from '../src/app/demo/demo-model';

const cta = (page: Page, id: string) => page.locator(`[data-cta="${id}"]`);
async function login(page: Page) { await page.goto('/demo/login'); await page.getByLabel('Contraseña', { exact: true }).fill('demo'); await cta(page, 'login-submit').click(); await cta(page, 'login-customer').click(); }
async function cart(page: Page) { await login(page); await page.goto('/demo/catalog/DEMO-001'); await cta(page, 'product-variant').selectOption(Variant.Case.wire); await page.getByLabel('Cantidad', { exact: true }).fill('2'); await cta(page, 'product-add-cart').click(); await page.goto('/demo/checkout'); }
async function destination(page: Page, method = Method.Home) { await cta(page, 'checkout-destination').selectOption(method.wire); if (method === Method.Home) await page.getByRole('radio').first().check(); await cta(page, 'checkout-step-next').click(); }
async function review(page: Page) { await cta(page, 'checkout-delivery-confirm').check(); await cta(page, 'checkout-step-next').click(); }
async function stored(page: Page) { return page.evaluate(() => localStorage.getItem('storecore.commercial-demo.v1')); }

test('SC11A validates and focuses groups, never confirms by selector and preserves only unchanged acceptance', async ({ page }) => {
  await cart(page); const before = await stored(page);
  await cta(page, 'checkout-step-next').click(); await expect(page.getByRole('alert')).toContainText('dirección'); await expect(page.locator('#checkout-addresses')).toBeFocused();
  await expect(cta(page, 'checkout-destination')).toHaveAttribute('aria-invalid', 'false'); await expect(page.locator('#checkout-addresses')).toHaveAttribute('aria-invalid', 'true');
  await destination(page); await expect(page.locator('#checkout-stage-title')).toBeFocused(); await expect(cta(page, 'checkout-delivery-confirm')).not.toBeChecked();
  await cta(page, 'checkout-step-next').click(); await expect(cta(page, 'checkout-delivery-confirm')).toBeFocused(); await expect(cta(page, 'checkout-delivery-confirm')).toHaveAttribute('aria-describedby', 'checkout-issue');
  await review(page); await expect(page.locator('.checkout-review-line')).toContainText(Variant.Case.label); await expect(page.locator('.checkout-review-line')).toContainText('Cantidad 2');
  await expect(page.getByRole('status')).toContainText(DemoPaymentPhase.Ready.label);
  await cta(page, 'checkout-review-edit-destination').click(); await cta(page, 'checkout-step-next').click(); await expect(cta(page, 'checkout-delivery-confirm')).toBeChecked();
  await cta(page, 'checkout-delivery-edit').click(); await cta(page, 'checkout-destination').selectOption(Method.Pickup.wire); await expect(page.getByRole('radio')).toHaveCount(0);
  await cta(page, 'checkout-destination').selectOption(Method.Home.wire); await cta(page, 'checkout-step-next').click(); await expect(cta(page, 'checkout-delivery-confirm')).not.toBeChecked();
  expect(await stored(page)).toBe(before);
});

for (const method of Method.all) {
  test(`SC11A ${method.wire} review equals persisted order and receipt after reload`, async ({ page }) => {
    await cart(page); await destination(page, method); await review(page);
    const details = page.locator('.checkout-delivery-details'); const destinationText = await details.locator('p').first().innerText();
    const total = await page.locator('.summary .total strong').innerText(); await expect(cta(page, 'checkout-confirm')).toContainText(total);
    await cta(page, 'checkout-confirm').click(); await expect(page).toHaveURL(/checkout\/result/); await expect(page.locator('.summary-row.total')).toContainText(total);
    await expect(page.locator('main')).toContainText(destinationText); await page.reload(); await expect(page.locator('main')).toContainText(destinationText);
    await cta(page, 'result-view-order').click(); await cta(page, 'order-receipt').click(); await expect(page.locator('.receipt-preview')).toContainText(total); await expect(page.locator('.receipt-preview')).toContainText(destinationText);
    const snapshot = JSON.parse((await stored(page))!); const order = snapshot.orders.at(-1); expect(order.lines[0].quantity).toBe(2); expect(order.delivery.method.wire).toBe(method.wire);
  });
}

test('SC11A empty cart has no phantom fee or actionable checkout; new address is selected after durable save', async ({ page }) => {
  await login(page); await page.goto('/demo/checkout'); await expect(cta(page, 'checkout-confirm')).toHaveCount(0); await expect(cta(page, 'checkout-step-next')).toHaveCount(0); await expect(page.locator('.summary')).toHaveCount(0);
  await cta(page, 'checkout-empty-catalog').click(); await expect(page).toHaveURL(/\/demo\/catalog$/);
  await cart(page); await cta(page, 'checkout-address-add').click(); await page.getByLabel('Calle y número').fill('Nueva calle 42'); await page.getByLabel('Ciudad', { exact: true }).fill('Córdoba'); await page.getByLabel('Código postal').fill('5000'); await cta(page, 'address-save').click();
  await expect(page.locator('#checkout-addresses')).toBeFocused(); await expect(page.getByRole('radio').last()).toBeChecked(); await cta(page, 'checkout-step-next').click(); await expect(page.locator('.checkout-delivery-details')).toContainText('Nueva calle 42');
});

test('SC11A duplicate submit, cancellation, destruction, logout and failed write cannot create a silent order', async ({ page }) => {
  await page.clock.install(); await cart(page); await destination(page); await review(page); const before = await stored(page);
  await cta(page, 'checkout-confirm').click(); await expect(cta(page, 'checkout-confirm')).toBeDisabled(); await cta(page, 'checkout-payment-cancel').click(); await page.clock.fastForward(1000); expect(await stored(page)).toBe(before);
  await cta(page, 'checkout-confirm').click(); await cta(page, 'checkout-edit-cart').click(); await page.clock.fastForward(1000); expect(await stored(page)).toBe(before);
  await page.goto('/demo/checkout'); await destination(page); await review(page); await cta(page, 'checkout-confirm').click(); await cta(page, 'shell-logout').click(); await page.clock.fastForward(1000); expect(await stored(page)).toBe(before);
  await login(page); await page.goto('/demo/checkout'); await destination(page); await review(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'storecore.commercial-demo.v1') throw new DOMException('Simulated quota', 'QuotaExceededError'); original.call(this, key, value); }; });
  await cta(page, 'checkout-confirm').click(); await page.clock.fastForward(1000); await expect(page.getByRole('alert')).toBeVisible(); await expect(page).toHaveURL(/\/demo\/checkout$/); expect(await stored(page)).toBe(before);
});

test('SC11A stale persisted quote cannot submit after another snapshot write', async ({ page }) => {
  await cart(page); await destination(page); await review(page); const original = JSON.parse((await stored(page))!);
  await page.evaluate(() => { const key = 'storecore.commercial-demo.v1'; const snapshot = JSON.parse(localStorage.getItem(key)!); snapshot.settings.deliveryDays++; snapshot.revision++; localStorage.setItem(key, JSON.stringify(snapshot)); });
  await cta(page, 'checkout-confirm').click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page).toHaveURL(/\/demo\/checkout$/);
  expect(JSON.parse((await stored(page))!).orders.length).toBe(original.orders.length);
});

test('SC11A read-only second tab cannot commit checkout and gains ownership only after reload', async ({ page, context }) => {
  await cart(page); const before = await stored(page); const second = await context.newPage();
  await login(second); await second.goto('/demo/checkout'); await destination(second); await review(second); await cta(second, 'checkout-confirm').click();
  await expect(second.getByRole('alert')).toBeVisible(); expect(await stored(second)).toBe(before);
  await page.close(); await second.reload(); await destination(second); await review(second); await cta(second, 'checkout-confirm').click(); await expect(second).toHaveURL(/checkout\/result/); await second.close();
});

for (const width of [320, 390, 768, 900, 1440]) {
  test(`SC11A keyboard, responsive steps and Axe ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await cart(page);
    await expect(page.locator('.checkout-total-strip')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`checkout-destination-${width}.png`), fullPage: true });
    await destination(page); await expect(page.locator('[aria-current="step"]')).toContainText('Entrega');
    await cta(page, 'checkout-delivery-confirm').focus(); await page.keyboard.press('Space'); await cta(page, 'checkout-step-next').click(); await expect(page.locator('#checkout-stage-title')).toBeFocused();
    await expect(page.locator('[aria-current="step"]')).toContainText('Revisión'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await cta(page, 'checkout-confirm').focus(); const bounds = await cta(page, 'checkout-confirm').boundingBox(); const strip = await page.locator('.checkout-total-strip').boundingBox(); expect(bounds!.y).toBeGreaterThanOrEqual(strip!.y + strip!.height);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.screenshot({ path: info.outputPath(`checkout-review-${width}.png`), fullPage: true });
    await cta(page, 'checkout-step-back').click(); await expect(page.locator('#checkout-stage-title')).toBeFocused(); await expect(cta(page, 'checkout-delivery-confirm')).toBeChecked();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.screenshot({ path: info.outputPath(`checkout-delivery-${width}.png`), fullPage: true });
  });
}
