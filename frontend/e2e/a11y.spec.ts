import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { AccessContext } from '../src/app/domain/access/access-context';
import { AccessHome } from '../src/app/domain/access/access-home';
import { LoginResolution } from '../src/app/domain/access/login-resolution';
import { ReturnDestination } from '../src/app/domain/access/return-destination';
import { UserRole } from '../src/app/domain/user/user-role';

const publicScreens = [
  { path: '/', heading: /^Inicio$/i },
  { path: '/catalog', heading: /Catálogo/i },
  { path: '/login', heading: /^Ingresar$/i },
  { path: '/customer/session', heading: /^Ingresar$/i },
  { path: '/customer/register', heading: /Crear cuenta customer/i },
  { path: '/user/session', heading: /^Ingresar$/i },
];

for (const screen of publicScreens) {
  test(`axe has no serious violations on ${screen.path}`, async ({ page }) => {
    await page.goto(screen.path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(screen.heading);
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeAttached();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
async function checkAxe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test('verified challenge selection is keyboard accessible and clears the password', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/login')) return route.fulfill({ json: envelope({ kind: LoginResolution.ContextSelectionRequired.wire, challenge: 'c'.repeat(32), contexts: [AccessContext.Customer.wire, AccessContext.User.wire], expiresAt: new Date(Date.now() + 120_000).toISOString(), destination: { kind: ReturnDestination.Home.wire } }) });
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
  await page.goto('/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill('buyer@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('password-long-enough');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Elegí cómo continuar' })).toBeFocused();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: AccessContext.Customer.label, exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: AccessContext.User.label, exact: true })).toBeEnabled();
  await checkAxe(page);
});

test('two already valid sessions choose locally and do not consume a challenge', async ({ page }) => {
  let selectionRequests = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/context-selection')) selectionRequests++;
    if (path.endsWith('/customer/me')) return route.fulfill({ json: envelope({ email: 'buyer@example.test', firstName: 'Buyer', lastName: '', phone: '' }) });
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'user-1', roles: [UserRole.Operator.wire] }) });
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'test-csrf' } });
    return route.fulfill({ status: 503, json: {} });
  });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Elegí cómo continuar' })).toBeVisible();
  await checkAxe(page);
  await page.getByRole('button', { name: AccessContext.User.label, exact: true }).click();
  await expect(page).toHaveURL(AccessHome.Operations.route!);
  expect(selectionRequests).toBe(0);
});

for (const role of [UserRole.Admin, UserRole.Operator]) {
  test(`operational home is accessible for ${role.label}`, async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'user-1', roles: [role.wire] }) });
      if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'test-csrf' } });
      return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
    });
    await page.goto('/user/home');
    await expect(page.getByRole('heading', { name: 'Inicio de operaciones' })).toBeVisible();
    if (role === UserRole.Operator) await expect(page.getByRole('link', { name: 'Promos', exact: true })).toHaveCount(0);
    else await expect(page.getByRole('link', { name: 'Promos', exact: true })).toHaveCount(2);
    await checkAxe(page);
  });
}
