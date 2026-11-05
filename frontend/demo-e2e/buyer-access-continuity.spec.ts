import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { DemoContext, DemoProductVariant as Variant, demoSeed } from '../src/app/demo/demo-model';
import { UserRole } from '../src/app/domain/user/user-role';
import { CustomerAccountState } from '../src/app/demo/customers/customer-account';

const cta = (page: Page, id: string) => page.locator(`[data-cta="${id}"]`);
async function authenticate(page: Page, context = DemoContext.Customer, role = UserRole.Unknown) {
  await page.getByLabel('Email', { exact: true }).fill('cliente@demo.invalid');
  await page.getByLabel('Contraseña', { exact: true }).fill('demo');
  await cta(page, 'login-submit').click();
  await cta(page, context === DemoContext.Customer ? 'login-customer' : role === UserRole.Operator ? 'login-operator' : 'login-admin').click();
}
function returnTarget(page: Page): URL {
  return new URL(new URL(page.url()).searchParams.get('returnUrl')!, 'https://demo.invalid');
}
async function liveSelection(page: Page) {
  await page.goto('/demo/catalog/DEMO-001?q=DEMO&stock=available&sort=price-down&variant=standard&quantity=1');
  await cta(page, 'product-variant').selectOption(Variant.Case.wire);
  await page.getByLabel('Cantidad', { exact: true }).fill('2');
}

test('live purchase survives login, register and recovery links, reload and signup without auto-add', async ({ page }) => {
  await liveSelection(page); const before = await page.evaluate(() => ({ ...localStorage }));
  await cta(page, 'product-add-cart').click();
  const target = returnTarget(page); expect(target.pathname).toBe('/demo/catalog/DEMO-001');
  expect(target.searchParams.get('variant')).toBe(Variant.Case.wire); expect(target.searchParams.get('quantity')).toBe('2');
  expect(target.searchParams.get('q')).toBe('DEMO'); expect(target.searchParams.get('stock')).toBe('available');
  await cta(page, 'login-register-link').click(); expect(returnTarget(page).href).toBe(target.href);
  await cta(page, 'login-register-link').click(); await cta(page, 'login-recover-link').click();
  await cta(page, 'recovery-login').click(); expect(returnTarget(page).href).toBe(target.href);
  await page.reload(); await cta(page, 'login-register-link').click();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  await page.getByLabel('Nombre', { exact: true }).fill('Continuity buyer');
  await page.getByLabel('Email', { exact: true }).fill('continuity@demo.invalid');
  await page.getByLabel('Contraseña', { exact: true }).fill('demo'); await cta(page, 'login-submit').click();
  await expect(page).toHaveURL(new RegExp('/demo/catalog/DEMO-001\\?'));
  await expect(cta(page, 'product-variant')).toHaveValue(Variant.Case.wire);
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('2');
  await expect(cta(page, 'shell-cart')).toContainText('0');
  await page.reload(); await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('2');
  await cta(page, 'product-back').click(); expect(new URL(page.url()).searchParams.get('q')).toBe('DEMO');
  await page.goBack(); await cta(page, 'product-add-cart').click(); await cta(page, 'product-review-cart').click();
  const line = page.locator('.cart-line').filter({ hasText: 'DEMO-001' });
  await expect(line).toContainText(Variant.Case.label); await expect(line.getByLabel('Cantidad', { exact: true })).toHaveValue('2');
});

test('PDP favorite also keeps the live selection and never toggles automatically', async ({ page }) => {
  await liveSelection(page); await cta(page, 'product-favorite').click();
  expect(returnTarget(page).searchParams.get('variant')).toBe(Variant.Case.wire);
  expect(returnTarget(page).searchParams.get('quantity')).toBe('2');
  await authenticate(page); await expect(cta(page, 'product-variant')).toHaveValue(Variant.Case.wire);
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('2');
  await expect(cta(page, 'product-favorite')).toHaveText('Quitar favorito');
  await expect(cta(page, 'shell-cart')).toContainText('0');
  await cta(page, 'product-favorite').click(); await expect(cta(page, 'product-favorite')).toHaveText('Guardar favorito');
});

test('catalog favorite and guarded cart/checkout preserve their locations with explicit actions only', async ({ page }) => {
  await page.goto('/demo/catalog?q=DEMO-002&stock=available'); await cta(page, 'favorite-DEMO-002').click();
  const target = returnTarget(page); await authenticate(page); await expect(page).toHaveURL(new RegExp('/demo/catalog\\?'));
  expect(new URL(page.url()).searchParams.get('q')).toBe(target.searchParams.get('q'));
  await expect(cta(page, 'favorite-DEMO-002')).toHaveAttribute('aria-label', 'Guardar en favoritos');
  await cta(page, 'shell-logout').click();
  for (const destination of ['/demo/cart', '/demo/checkout']) {
    await page.goto(destination); await cta(page, 'access-login').click(); expect(returnTarget(page).pathname).toBe(destination);
    await authenticate(page); await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect(cta(page, 'shell-cart')).toContainText('0'); await cta(page, 'shell-logout').click();
  }
});

test('administrative landings ignore customer return and failed duplicate signup retains intent', async ({ page }) => {
  for (const entry of [{ role: UserRole.Admin, target: '/demo/user/home' }, { role: UserRole.Operator, target: '/demo/user/customers' }]) {
    await page.goto('/demo/login?returnUrl=%2Fdemo%2Fcart'); await authenticate(page, DemoContext.Admin, entry.role);
    await expect(page).toHaveURL(new RegExp(`${entry.target}$`)); await cta(page, 'shell-logout').click();
  }
  await page.goto('/demo/customer/register?returnUrl=%2Fdemo%2Fcart');
  await page.getByLabel('Nombre', { exact: true }).fill('Duplicate');
  await page.getByLabel('Contraseña', { exact: true }).fill('demo');
  await cta(page, 'login-submit').click(); await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/customer\/register\?returnUrl=/); expect(returnTarget(page).pathname).toBe('/demo/cart');
  await page.getByLabel('Email', { exact: true }).fill('failedwrite@demo.invalid');
  const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'storecore.commercial-demo.v1') throw new DOMException('Simulated quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await cta(page, 'login-submit').click(); await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/customer\/register\?returnUrl=/);
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual(before);
  await page.reload(); await page.getByLabel('Nombre', { exact: true }).fill('Retry buyer');
  await page.getByLabel('Email', { exact: true }).fill('failedwrite@demo.invalid');
  await page.getByLabel('Contraseña', { exact: true }).fill('demo');
  await cta(page, 'login-submit').click(); await expect(page).toHaveURL(/\/demo\/cart$/);
});

test('restricted and Unknown customer authorization retains intent without navigation or data mutation', async ({ page }) => {
  for (const accountState of [CustomerAccountState.Restricted, CustomerAccountState.Unknown]) {
    const snapshot = demoSeed(); snapshot.actors.find(actor => actor.id === 'cliente')!.access!.state = accountState;
    await page.goto('/demo/login');
    await page.evaluate(raw => { localStorage.setItem('storecore.commercial-demo.v1', raw); sessionStorage.clear(); }, JSON.stringify(snapshot));
    await page.goto('/demo/login?returnUrl=%2Fdemo%2Fcart'); const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    await authenticate(page); await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/demo\/login\?returnUrl=/);
    expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual(before);
  }
});

test('stockless PDP favorite remains available without creating a purchase or automatic favorite', async ({ page }) => {
  const snapshot = demoSeed(); const product = snapshot.products.find(value => value.sku === 'DEMO-002')!; product.onHand = product.reserved;
  await page.goto('/demo'); await page.evaluate(raw => localStorage.setItem('storecore.commercial-demo.v1', raw), JSON.stringify(snapshot));
  await page.goto('/demo/catalog/DEMO-002'); await expect(cta(page, 'product-add-cart')).toBeDisabled();
  await cta(page, 'product-favorite').click(); await authenticate(page);
  await expect(page).toHaveURL(/\/demo\/catalog\/DEMO-002\?/);
  await expect(cta(page, 'product-favorite')).toHaveText('Guardar favorito');
  await cta(page, 'product-favorite').click(); await expect(cta(page, 'product-favorite')).toHaveText('Quitar favorito');
});

for (const available of [0, 1]) {
  test(`favorite access ignores non-purchasable live quantity at stock ${available}`, async ({ page }) => {
    const snapshot = demoSeed(); const product = snapshot.products.find(value => value.sku === 'DEMO-002')!; product.onHand = product.reserved + available;
    await page.goto('/demo'); await page.evaluate(raw => localStorage.setItem('storecore.commercial-demo.v1', raw), JSON.stringify(snapshot));
    await page.goto('/demo/catalog/DEMO-002'); await page.getByLabel('Cantidad', { exact: true }).fill('2');
    const before = await page.evaluate(() => ({ ...localStorage }));
    await cta(page, 'product-favorite').click(); expect(returnTarget(page).searchParams.has('quantity')).toBe(false);
    await authenticate(page); await expect(page).toHaveURL(/\/demo\/catalog\/DEMO-002\?/);
    await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('1');
    await expect(cta(page, 'product-favorite')).toHaveText('Guardar favorito');
    await expect(cta(page, 'shell-cart')).toContainText('0');
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
    await cta(page, 'product-favorite').click(); await expect(cta(page, 'product-favorite')).toHaveText('Quitar favorito');
  });
}

for (const width of [320, 390, 768, 900, 1440]) {
  test(`buyer auth continuity keyboard and responsive at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await liveSelection(page); await cta(page, 'product-add-cart').click();
    await expect(page.locator('.access-continuation-note')).toContainText('como cliente');
    const email = page.getByLabel('Email', { exact: true }); await email.focus(); await page.keyboard.press('Tab');
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`buyer-login-${width}.png`), fullPage: true });
    await cta(page, 'login-register-link').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`buyer-register-${width}.png`), fullPage: true });
  });
}
