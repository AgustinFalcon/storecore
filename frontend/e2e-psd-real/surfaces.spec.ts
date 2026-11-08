import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { AccessContext } from '../src/app/domain/access/access-context';
import { OfferStatus, OfferTransition } from '../src/app/domain/offer/offer';
import { CustomerStateTransition } from '../src/app/domain/customer-admin/customer-admin';
import { UserRole } from '../src/app/domain/user/user-role';
import { OverviewFactState, OverviewPeriod } from '../src/app/domain/overview/overview';
import { apiCustomerLogin, customerEmail, login, origin } from './support';

test('customer favorite removal persists and USER authority stays separate', async ({ page }) => {
  await login(page, AccessContext.Customer);
  expect((await page.request.get('/api/v1/internal/me')).status()).toBe(401);
  await page.goto('/customer/favorites');
  await expect(page.getByRole('heading', { name: 'Tus favoritos' })).toBeVisible();
  await expect(page.locator('.sc-favorite-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Quitar', exact: true }).click();
  await expect(page.locator('.sc-favorite-card')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Todavía no guardaste productos.', { exact: false })).toBeVisible();
  const readback = await page.request.get('/api/v1/customer/favorites');
  expect(readback.status()).toBe(200);
  expect((await readback.json()).data).toEqual([]);
  await page.goto('/catalog/SHOW-TALADRO-18V');
  const saved = page.waitForResponse(response => response.request().method() === 'PUT' &&
    new URL(response.url()).pathname === '/api/v1/customer/favorites/SHOW-TALADRO-18V');
  await page.getByRole('button', { name: /Guardar en favoritos/ }).click();
  const mutation = await saved;
  expect(mutation.status()).toBe(200);
  expect(mutation.request().headers()['x-csrf-token']).toBeTruthy();
  expect(mutation.headers()['x-csrf-token']).toBeTruthy();
  await page.goto('/customer/favorites');
  await page.reload();
  await expect(page.locator('.sc-favorite-card')).toHaveCount(1);
});

test('OPERATOR reads customers and overview while ADMIN mutations and foreign CSRF fail closed', async ({ page, browser }) => {
  await login(page, AccessContext.User, UserRole.Operator);
  await page.goto('/user/home');
  await expect(page.getByRole('heading', { name: 'Resumen operativo' })).toBeVisible();
  await page.goto('/user/customers');
  await page.getByLabel('Buscar cliente').fill(customerEmail);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('row').filter({ hasText: customerEmail }).getByRole('button', { name: 'Ver detalle' }).click();
  await expect(page.getByRole('heading', { name: 'Ficha de atención' })).toBeVisible();
  await expect(page.locator('[data-customer-transition]')).toHaveCount(0);
  const customers = await page.request.get(`/api/v1/user/customers?query=${encodeURIComponent(customerEmail)}`);
  expect(customers.status()).toBe(200);
  const id = (await customers.json()).data.items[0].id;
  const csrf = (await page.request.get('/api/v1/internal/auth/csrf')).headers()['x-csrf-token'];
  expect(csrf).toBeTruthy();
  const denied = await page.request.post(`/api/v1/user/customers/${id}/state`, {
    headers: { Origin: origin, 'X-CSRF-Token': csrf }, data: { state: CustomerStateTransition.Suspend.target.wire } });
  expect(denied.status()).toBe(403);
  expect((await page.request.get('/api/v1/user/offers')).status()).toBe(403);
  const customerContext = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    const customer = await customerContext.newPage(); await apiCustomerLogin(customer);
    const foreignToken = (await customer.request.get('/api/v1/customer/auth/csrf')).headers()['x-csrf-token'];
    expect(foreignToken).toBeTruthy();
    const invalid = await page.request.post('/api/v1/internal/auth/logout', {
      headers: { Origin: origin, 'X-CSRF-Token': foreignToken } });
    expect(invalid.status()).toBe(403);
    expect((await page.request.get('/api/v1/internal/me')).status()).toBe(200);
    expect((await customer.request.get('/api/v1/customer/me')).status()).toBe(200);
  } finally { await customerContext.close(); }
});

test('admin creates and ends a local offer through Angular and real HTTP', async ({ page }) => {
  await login(page, AccessContext.User);
  expect((await page.request.get('/api/v1/customer/me')).status()).toBe(401);
  await page.goto('/user/offers');
  await expect(page.getByRole('heading', { name: 'Ofertas locales' })).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill('PSD_BROWSER_LOCAL_OFFER');
  await page.getByLabel('SKU de referencia', { exact: false }).fill('SHOW-SET-MANUAL');
  await page.getByRole('button', { name: 'Crear borrador', exact: true }).click();
  const offer = page.locator('article').filter({ has: page.getByRole('heading', { name: 'PSD_BROWSER_LOCAL_OFFER', exact: true }) });
  await expect(offer).toContainText(OfferStatus.Draft.label);
  await offer.getByRole('button', { name: OfferTransition.End.label, exact: true }).click();
  await page.locator('[data-confirm-transition]').click();
  await expect(offer).toContainText(OfferStatus.Ended.label);
  await page.reload();
  await expect(offer).toContainText(OfferStatus.Ended.label);
  const response = await page.request.get('/api/v1/user/offers');
  expect(response.status()).toBe(200);
  const rows = (await response.json()).data as { name: string; status: unknown }[];
  expect(OfferStatus.fromWire(rows.find(item => item.name === 'PSD_BROWSER_LOCAL_OFFER')?.status)).toBe(OfferStatus.Ended);
});

for (const width of [390, 768, 1440]) {
  test(`overview and inventory use durable data with accessibility at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page, AccessContext.User);
    await page.goto('/user/home');
    await expect(page.getByRole('heading', { name: 'Resumen operativo' })).toBeVisible();
    await expect(page.getByLabel('Indicadores del período')).toBeVisible();
    const response = await page.request.get(`/api/v1/user/overview?period=${OverviewPeriod.Last30Days.wire}`);
    expect(response.status()).toBe(200);
    const overview = (await response.json()).data;
    expect(OverviewFactState.fromWire(overview.orderCount.state)).toBe(OverviewFactState.Known);
    expect(overview.orderCount.value).toBe(1);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto('/user/inventory');
    await expect(page.getByRole('heading', { name: 'Inventario WEB', exact: true })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: /^SHOW-SET-MANUAL / })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('customer search/detail suspension revokes an existing CUSTOMER session', async ({ page, browser }) => {
  const context = await browser.newContext({ baseURL: 'https://localhost:4301', ignoreHTTPSErrors: true });
  try {
    const customer = await context.newPage(); await apiCustomerLogin(customer);
    expect((await customer.request.get('/api/v1/customer/me')).status()).toBe(200);
    await login(page, AccessContext.User);
    await page.goto('/user/customers');
    await page.getByLabel('Buscar cliente').fill(customerEmail);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: customerEmail });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Ver detalle', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ficha de atención' })).toBeVisible();
    await page.getByRole('button', { name: CustomerStateTransition.Suspend.label, exact: true }).click();
    await page.locator('[data-confirm-customer]').click();
    await expect(page.getByRole('button', { name: CustomerStateTransition.Reactivate.label, exact: true })).toBeVisible();
    expect((await customer.request.get('/api/v1/customer/me')).status()).toBe(401);
    // Restore access; the revoked session must never revive.
    await page.getByRole('button', { name: CustomerStateTransition.Reactivate.label, exact: true }).click();
    await page.locator('[data-confirm-customer]').click();
    await expect(page.getByRole('button', { name: CustomerStateTransition.Suspend.label, exact: true })).toBeVisible();
    expect((await customer.request.get('/api/v1/customer/me')).status()).toBe(401);
  } finally { await context.close(); }
});

test('optimized Production and Demo runtime entries remain isolated', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) calls.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Todo para tu taller, en un solo lugar' })).toBeVisible();
  expect(calls.length).toBeGreaterThan(0);
  await expect(page.getByText('DEMO', { exact: true })).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  calls.length = 0;
  await page.goto('http://127.0.0.1:4390/demo');
  await expect(page.getByRole('region', { name: 'Controles de demostración' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(calls).toEqual([]);
});
