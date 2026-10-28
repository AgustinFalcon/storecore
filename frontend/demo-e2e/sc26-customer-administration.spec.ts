import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test, TestInfo } from '@playwright/test';
import { DemoContext, DemoSnapshot, decodeSnapshot, demoSeed } from '../src/app/demo/demo-model';
import { CustomerAccountCommand, CustomerAccountState } from '../src/app/demo/customers/customer-account';
import { UserRole } from '../src/app/domain/user/user-role';

const key = 'storecore.commercial-demo.v1';
const seed = demoSeed();
const customer = seed.actors.find(actor => actor.id === 'customer-2209')!;
const order = seed.orders.find(order => order.actor === customer.id)!;
const fullName = `${customer.firstName} ${customer.lastName}`;
const cta = (page: Page, id: string) => page.locator(`[data-cta="${id}"]`);
const summary = (page: Page) => page.getByRole('dialog', { name: fullName, exact: true });
const confirmation = (page: Page, command = CustomerAccountCommand.Restrict) => page.getByRole('dialog', { name: command.label, exact: true });

async function login(page: Page, context = DemoContext.Admin, role = UserRole.Admin) {
  await page.goto('/demo/login');
  await page.getByLabel('Email', { exact: true }).fill(customer.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('demo');
  await cta(page, 'login-submit').click();
  await cta(page, context === DemoContext.Customer ? 'login-customer' : role === UserRole.Operator ? 'login-operator' : 'login-admin').click();
}

async function openCustomer(page: Page) {
  await page.goto('/demo/user/customers');
  await page.getByLabel('Buscar clientes', { exact: true }).fill(customer.id);
  await cta(page, `customer-open-${customer.id}`).click();
  await expect(summary(page)).toBeVisible();
}

async function stored(page: Page): Promise<DemoSnapshot> {
  const raw = await page.evaluate(storageKey => localStorage.getItem(storageKey), key);
  return raw ? decodeSnapshot(raw) : demoSeed();
}

async function axe(page: Page, info: TestInfo, scene: string) {
  const results = await new AxeBuilder({ page }).analyze();
  await info.attach(`${scene}-axe`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' });
  expect.soft(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical'), scene).toEqual([]);
}

async function frame(page: Page, info: TestInfo, scene: string) {
  await page.screenshot({ path: info.outputPath(`${scene}.png`), fullPage: true });
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${scene}: document overflow`).toBe(true);
  const clipping = await page.locator('dialog[open]').evaluateAll(elements => elements.map(element => ({ id: element.id, width: element.clientWidth, scroll: element.scrollWidth, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })).filter(item => item.scroll > item.width + 1 || item.left < 0 || item.right > innerWidth + 1));
  expect.soft(clipping, `${scene}: dialog overflow`).toEqual([]);
  await axe(page, info, scene);
}

test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    expect(url.origin).toBe('http://127.0.0.1:4390');
    expect(url.pathname).not.toMatch(/^\/(api|auth|oauth)(\/|$)/);
    await route.continue();
  });
});

test('SC26 Admin canonical search, exact ownership, nested dialog keyboard and order route', async ({ page }, info) => {
  await login(page);
  await page.goto('/demo/user/customers');
  const search = page.getByLabel('Buscar clientes', { exact: true });
  for (const query of ['Rocio', customer.email, customer.id]) {
    await search.fill(query);
    await expect(page.locator('.customer-grid article')).toHaveCount(1);
    await expect(page.locator('.customer-grid')).toContainText(fullName);
    await expect(page.locator('.customers-page [aria-live="polite"]')).toHaveText('1 clientes encontrados');
  }
  await search.fill('no-matching-customer');
  await expect(page.getByRole('heading', { name: 'No hay resultados' })).toBeVisible();
  await page.locator('.customer-grid .empty-state').getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(search).toHaveValue('');
  const opener = cta(page, `customer-open-${customer.id}`);
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(summary(page)).toContainText(customer.email);
  await expect(summary(page)).toContainText(customer.phone);
  await expect(summary(page).getByRole('link')).toHaveCount(1);
  await expect(summary(page)).toContainText(order.id);
  await expect.soft(summary(page)).toContainText('Dirección ficticia');
  await expect.soft(summary(page)).not.toContainText('CP 2209');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');
  const restrict = summary(page).getByRole('button', { name: CustomerAccountCommand.Restrict.label });
  await restrict.focus();
  await page.keyboard.press('Enter');
  await expect(confirmation(page)).toContainText(`${fullName} · ${customer.id}`);
  await expect(confirmation(page).getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled();
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press('Tab');
    const focus = await confirmation(page).evaluate(element => ({ inside: element.contains(document.activeElement), browserChrome: document.activeElement === document.body && !document.hasFocus(), active: document.activeElement?.tagName }));
    // Chromium may move Tab to browser chrome; no background page control may receive focus.
    expect(focus.inside || focus.browserChrome, `Tab ${index + 1}: ${JSON.stringify(focus)}`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(restrict).toBeFocused();
  await expect(summary(page)).toBeVisible();
  await summary(page).getByRole('link', { name: new RegExp(order.id) }).click();
  await expect(page).toHaveURL(`/demo/user/orders/${order.id}`);
  await expect(page.locator('main')).toContainText('Medio de pago no informado');
  await expect(page.locator('main')).toContainText(order.tracking);
  await expect(page.locator('main')).not.toContainText('Tarjeta de crédito');
  await cta(page, 'order-receipt').click();
  await expect(page.locator('.receipt-preview')).toContainText(`Entrega ${order.fulfillment?.label} · Costo no informado`);
  await expect(page.locator('.receipt-preview')).not.toContainText(/Entrega\s+\$\s*0/);
  await page.keyboard.press('Escape');
  await axe(page, info, 'canonical-order');
});

for (const width of [320, 390, 768, 1440]) {
  test(`SC26 responsive and Axe list/detail/restrict/reactivate ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
    await login(page);
    await page.goto('/demo/user/customers');
    if (width < 900) {
      const firstCard = page.locator('.customer-grid article').first();
      expect.soft((await firstCard.boundingBox())!.y, 'First customer begins in the initial viewport').toBeLessThan(900);
    }
    await frame(page, info, 'list');
    await cta(page, `customer-open-${customer.id}`).click();
    await frame(page, info, 'detail');
    await summary(page).getByRole('button', { name: CustomerAccountCommand.Restrict.label }).click();
    await page.getByLabel('Motivo de restricción', { exact: true }).fill('Restricción de prueba QA SC26');
    await frame(page, info, 'restrict');
    await confirmation(page).getByRole('button', { name: 'Confirmar cambio' }).click();
    await expect(summary(page)).toContainText(CustomerAccountState.Restricted.label);
    expect.soft(await summary(page).evaluate(element => element.contains(document.activeElement)), 'Focus stays in summary after successful restriction').toBe(true);
    await expect.soft(summary(page).getByRole('status').filter({ hasText: 'Cambio guardado' })).toBeVisible();
    await summary(page).getByRole('button', { name: CustomerAccountCommand.Reactivate.label }).click();
    await frame(page, info, 'reactivate');
    await confirmation(page, CustomerAccountCommand.Reactivate).getByRole('button', { name: 'Confirmar cambio' }).click();
    await expect(summary(page)).toContainText(CustomerAccountState.Active.label);
  });
}

test('SC26 cancellation and failed write preserve snapshot and entered reason', async ({ page }, info) => {
  await login(page);
  await openCustomer(page);
  const before = await stored(page);
  await summary(page).getByRole('button', { name: CustomerAccountCommand.Restrict.label }).click();
  const reason = page.getByLabel('Motivo de restricción', { exact: true });
  await reason.fill('Motivo conservado si falla el guardado');
  await confirmation(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await stored(page)).toEqual(before);
  await summary(page).getByRole('button', { name: CustomerAccountCommand.Restrict.label }).click();
  await expect(reason).toHaveValue('');
  await reason.fill('Motivo conservado si falla el guardado');
  await page.evaluate(storageKey => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === storageKey) throw new DOMException('No se pudo guardar la demostración', 'QuotaExceededError'); original.call(this, key, value); };
  }, key);
  await confirmation(page).getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(confirmation(page).getByRole('alert')).toContainText('No se pudo guardar');
  await expect(reason).toHaveValue('Motivo conservado si falla el guardado');
  expect(await stored(page)).toEqual(before);
  await expect(page.locator('.notice.success')).toHaveCount(0);
  await frame(page, info, 'write-failure');
});

test('SC26 mobile administration drawer opens by keyboard, closes with Escape and restores focus', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page);
  await page.goto('/demo/user/customers');
  const trigger = page.getByRole('button', { name: 'Navegación de administración', exact: true });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toHaveAttribute('aria-controls', 'demo-admin-navigation');
  await expect(page.locator('aside.sidebar')).toBeHidden();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Administración del comercio', exact: true });
  await expect(drawer).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await frame(page, info, 'mobile-admin-drawer');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await drawer.getByRole('link', { name: 'Clientes', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('SC26 restriction revokes existing customer session, blocks login/checkout, reactivation requires fresh login', async ({ page, context }) => {
  await login(page, DemoContext.Customer);
  await page.goto('/demo/catalog/LUM-042');
  await cta(page, 'product-add-cart').click();
  const before = await stored(page);
  const previousSession = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  // Release the writer by leaving the app; retain this tab's customer session.
  await page.goto('about:blank');
  const admin = await context.newPage();
  await login(admin);
  await openCustomer(admin);
  await summary(admin).getByRole('button', { name: CustomerAccountCommand.Restrict.label }).click();
  await admin.getByLabel('Motivo de restricción', { exact: true }).fill('Restricción de prueba QA SC26');
  await confirmation(admin).getByRole('button', { name: 'Confirmar cambio' }).click();
  const restricted = await stored(admin);
  const beforeCustomer = before.actors.find(actor => actor.id === customer.id)!;
  const afterCustomer = restricted.actors.find(actor => actor.id === customer.id)!;
  expect(afterCustomer.access?.state).toBe(CustomerAccountState.Restricted);
  expect(afterCustomer.cart).toEqual(beforeCustomer.cart);
  expect(afterCustomer.addresses).toEqual(beforeCustomer.addresses);
  expect(restricted.orders).toEqual(before.orders);
  await page.goto('/demo/checkout');
  await expect(cta(page, 'access-login')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('storecore.demo.context'))).toBeNull();
  await login(page, DemoContext.Customer);
  await expect(page.getByRole('alert')).toContainText('restringida');
  await expect(page).toHaveURL('/demo/login');
  await summary(admin).getByRole('button', { name: CustomerAccountCommand.Reactivate.label }).click();
  await confirmation(admin, CustomerAccountCommand.Reactivate).getByRole('button', { name: 'Confirmar cambio' }).click();
  expect((await stored(admin)).actors.find(actor => actor.id === customer.id)?.access?.state).toBe(CustomerAccountState.Active);
  await page.evaluate(values => { for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, value); }, previousSession);
  await page.goto('/demo/checkout');
  await expect(cta(page, 'access-login')).toBeVisible();
  await admin.close();
  await login(page, DemoContext.Customer);
  await page.goto('/demo/checkout');
  await expect(page.getByRole('heading', { name: '¿Dónde recibís tu pedido?' })).toBeVisible();
  expect((await stored(page)).orders).toEqual(before.orders);
});

test('SC26 Operator consults and opens order without mutation controls; Customer and Unknown denied', async ({ page }) => {
  await login(page, DemoContext.Admin, UserRole.Operator);
  await openCustomer(page);
  await expect(summary(page).getByRole('button', { name: CustomerAccountCommand.Restrict.label })).toHaveCount(0);
  await summary(page).getByRole('link', { name: new RegExp(order.id) }).click();
  await expect(page).toHaveURL(`/demo/user/orders/${order.id}`);
  for (const id of ['order-incident-open', 'order-return-receive', 'order-shipment-advance', 'order-payment-resolve']) await expect(cta(page, id)).toHaveCount(0);
  await expect(cta(page, 'shell-reset-open')).toBeDisabled();
  await cta(page, 'order-list-back').click();
  await expect(page).toHaveURL('/demo/user/customers');
  await login(page, DemoContext.Customer);
  await page.goto('/demo/user/customers');
  await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(customer.email);
  await page.evaluate(({ context, role }) => { sessionStorage.setItem('storecore.demo.context', context); sessionStorage.setItem('storecore.demo.role', role); }, { context: DemoContext.Admin.wire, role: UserRole.Unknown.wire });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(customer.email);
});

test('SC26 storage notification revokes only the affected active customer tab', async ({ page: admin, context }) => {
  await login(admin);
  await openCustomer(admin);
  const affected = await context.newPage();
  await login(affected, DemoContext.Customer);
  await affected.goto('/demo/checkout');
  const other = await context.newPage();
  const otherCustomer = seed.actors.find(actor => actor.id !== customer.id)!;
  await other.goto('/demo/login');
  await other.getByLabel('Email', { exact: true }).fill(otherCustomer.email);
  await other.getByLabel('Contraseña', { exact: true }).fill('demo');
  await cta(other, 'login-submit').click();
  await cta(other, 'login-customer').click();
  await summary(admin).getByRole('button', { name: CustomerAccountCommand.Restrict.label }).click();
  await admin.getByLabel('Motivo de restricción', { exact: true }).fill('Revocación aislada entre pestañas');
  await confirmation(admin).getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(cta(affected, 'access-login')).toBeVisible();
  expect(await affected.evaluate(() => sessionStorage.getItem('storecore.demo.context'))).toBeNull();
  expect(await other.evaluate(() => sessionStorage.getItem('storecore.demo.context'))).toBe(DemoContext.Customer.wire);
  expect(await other.evaluate(() => sessionStorage.getItem('storecore.demo.actor'))).toBe(otherCustomer.id);
  await summary(admin).getByRole('button', { name: CustomerAccountCommand.Reactivate.label }).click();
  await confirmation(admin, CustomerAccountCommand.Reactivate).getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(cta(affected, 'access-login')).toBeVisible();
  expect(await affected.evaluate(() => sessionStorage.getItem('storecore.demo.context'))).toBeNull();
});

test('SC26 Unknown account is safely readable and corrupt persistence offers contextual recovery', async ({ page }, info) => {
  await login(page);
  const unknown = demoSeed();
  unknown.actors.find(actor => actor.id === customer.id)!.access!.state = CustomerAccountState.Unknown;
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: JSON.stringify(unknown) });
  await openCustomer(page);
  await expect(summary(page)).toContainText(CustomerAccountState.Unknown.label);
  await expect(summary(page).getByRole('button', { name: CustomerAccountCommand.Restrict.label })).toHaveCount(0);
  await expect(summary(page).getByRole('button', { name: CustomerAccountCommand.Reactivate.label })).toHaveCount(0);
  await page.evaluate(storageKey => localStorage.setItem(storageKey, '{invalid-json'), key);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No se pudieron leer los datos Demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar lectura' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(customer.email);
  await expect(page.getByRole('heading', { name: 'Acceso denegado', exact: true })).toHaveCount(0);
  await frame(page, info, 'read-failure');
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: JSON.stringify(seed) });
  await page.getByRole('button', { name: 'Reintentar lectura' }).click();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
});
