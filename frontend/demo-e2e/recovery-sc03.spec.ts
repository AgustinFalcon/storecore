import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { DemoRecoveryPhase as Phase } from '../src/app/demo/identity/demo-recovery-phase';
import { DemoContext, DemoProductVariant } from '../src/app/demo/demo-model';
import { UserRole } from '../src/app/domain/user/user-role';

const cta = (page: Page, name: string) => page.locator(`[data-cta="${name}"]`);

async function chooseContext(page: Page, context = DemoContext.Customer, role = UserRole.Unknown): Promise<void> {
  await page.getByLabel('Email', { exact: true }).fill('cliente@demo.invalid');
  await page.getByLabel('Contraseña', { exact: true }).fill('demo');
  await cta(page, 'login-submit').click();
  await cta(page, context === DemoContext.Admin ? role === UserRole.Operator ? 'login-operator' : 'login-admin' : 'login-customer').click();
}

test('SC03 is an actual route and exposes neutral retryable outcomes without data or network effects', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType())) requests.push(request.url()); });
  await page.clock.install();
  await page.goto('/demo/login');
  await cta(page, 'login-recover-link').click();
  await expect(page).toHaveURL(/\/demo\/recover\?/);
  await expect(page.getByRole('heading', { name: 'Recuperar acceso', exact: true })).toBeVisible();
  const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const email = page.getByLabel('Email', { exact: true });
  const status = page.getByRole('status');
  for (const address of ['cliente@demo.invalid', 'absent@arbitrary.invalid']) {
    await email.fill(address); await cta(page, 'recovery-submit').click();
    await expect(status).toContainText(Phase.Submitting.label);
    await expect(cta(page, 'recovery-submit')).toBeDisabled();
    await page.clock.fastForward(300); await expect(status).toContainText(Phase.Sent.label);
    await expect(status).toContainText(Phase.Sent.description);
  }
  await page.getByText('Explorar resultados simulados', { exact: true }).click();
  for (const phase of Phase.specimens) {
    await cta(page, `recovery-scene-${phase.wire || 'unknown'}`).click();
    await expect(status).toContainText(phase.label); await expect(status).toContainText(phase.description);
    await expect(email).toHaveValue('absent@arbitrary.invalid');
  }
  await cta(page, 'recovery-scene-service-error').click();
  await cta(page, 'recovery-submit').click();
  await cta(page, 'recovery-scene-completed').click();
  await page.clock.fastForward(1000); await expect(status).toContainText(Phase.Completed.label);
  const after = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(after).toEqual(before); expect(requests).toEqual([]);
  await cta(page, 'recovery-submit').click(); await cta(page, 'recovery-login').click();
  await page.clock.fastForward(1000); await page.goBack();
  await expect(status).toContainText(Phase.Request.label);
});

test('SC03 return survives recovery/login for customers and never overrides Admin or Operator landing', async ({ page }) => {
  const destination = `/demo/catalog/DEMO-001?variant=${DemoProductVariant.Case.wire}&quantity=2`;
  const cases = [
    { context: DemoContext.Customer, role: UserRole.Unknown, target: destination },
    { context: DemoContext.Admin, role: UserRole.Admin, target: '/demo/user/home' },
    { context: DemoContext.Admin, role: UserRole.Operator, target: '/demo/user/customers' },
  ];
  for (const { context, role, target } of cases) {
    await page.goto(`/demo/recover?returnUrl=${encodeURIComponent(destination)}`);
    await cta(page, 'recovery-login').click(); await chooseContext(page, context, role);
    await expect(page).toHaveURL(new RegExp(`${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    if (context === DemoContext.Customer) {
      await expect(cta(page, 'product-variant')).toHaveValue(DemoProductVariant.Case.wire);
      await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('2');
      await page.reload();
      await expect(cta(page, 'product-variant')).toHaveValue(DemoProductVariant.Case.wire);
      await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('2');
      await cta(page, 'product-add-cart').click(); await cta(page, 'product-review-cart').click();
      const line = page.locator('.cart-line').filter({ hasText: 'DEMO-001' });
      await expect(line).toContainText(DemoProductVariant.Case.label);
      await expect(line.getByLabel('Cantidad', { exact: true })).toHaveValue('2');
    }
    await cta(page, 'shell-logout').click();
  }
});

test('SC03 rejects external, encoded and administrative return destinations', async ({ page }) => {
  for (const target of ['https://external.invalid/steal', '//external.invalid', '/demo/%75ser/home', '/demo/catalog/x%2fy', '/demo/user/home', '/demo/catalog/%2E%2E/cart', '/demo/catalog/%2e./cart', '/demo/catalog/.%2e/cart']) {
    await page.goto(`/demo/recover?returnUrl=${encodeURIComponent(target)}`);
    await cta(page, 'recovery-login').click();
    await expect(page).toHaveURL(/\/demo\/login\?returnUrl=%2Fdemo$/);
    await chooseContext(page); await expect(page).toHaveURL(/\/demo$/);
    await cta(page, 'shell-logout').click();
  }
});

test('SC03 invalid returned selection is not silently purchased as a different variant or amount', async ({ page }) => {
  await page.goto('/demo/login'); await chooseContext(page);
  for (const selection of [
    { sku: 'DEMO-001', query: 'variant=unsupported&quantity=2' },
    { sku: 'DEMO-007', query: `variant=${DemoProductVariant.Case.wire}&quantity=2` },
    { sku: 'DEMO-001', query: `variant=${DemoProductVariant.Standard.wire}&quantity=999` },
    { sku: 'DEMO-001', query: `variant=${DemoProductVariant.Standard.wire}&quantity=1.5` },
  ]) {
    await page.goto(`/demo/catalog/${selection.sku}?${selection.query}`);
    const before = await page.evaluate(() => ({ ...localStorage }));
    await cta(page, 'product-add-cart').click(); await expect(page.getByRole('alert')).toBeVisible();
    await expect(cta(page, 'shell-cart')).toContainText('0');
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  }
});

for (const width of [320, 390, 768, 900, 1440]) {
  test(`SC03 keyboard, responsive recovery and axe at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo/recover');
    const email = page.getByLabel('Email', { exact: true }); await email.focus(); await page.keyboard.type('keyboard@demo.invalid');
    await page.keyboard.press('Tab'); await expect(cta(page, 'recovery-submit')).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.getByRole('status')).toContainText(Phase.Sent.label);
    await page.getByText('Explorar resultados simulados', { exact: true }).focus(); await page.keyboard.press('Enter');
    await cta(page, 'recovery-scene-service-error').click();
    await expect(page.getByRole('status')).toContainText(Phase.ServiceError.label);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`recovery-${width}.png`), fullPage: true });
  });
}
