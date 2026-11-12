import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { RecoveryOutcome as Outcome, RecoveryRealm } from '../src/app/domain/access/recovery';
import { AccessHome } from '../src/app/domain/access/access-home';
import { LoginResolution } from '../src/app/domain/access/login-resolution';
import { ReturnDestination } from '../src/app/domain/access/return-destination';
import { UserRole } from '../src/app/domain/user/user-role';

const body = (kind: string, code = 200, extra = {}) => ({ code, data: { kind, ...extra }, errorCode: null });
const secret = 'a'.repeat(43); // An HTTP-boundary test value; never a real captured token.
async function publicBoundary(page: Page): Promise<void> {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/recovery/')) return route.fallback();
    if (path.endsWith('/me')) return route.fulfill({ status: 401, json: { code: 401 } });
    return route.fulfill({ json: { code: 200, data: {} } });
  });
}
async function resetReady(page: Page, realm = RecoveryRealm.Customer, lifetime = 60_000): Promise<void> {
  await page.route('**/auth/recovery/inspect', route => route.fulfill({ json: body(Outcome.Ready.wire, 200, { expiresAt: new Date(Date.now() + lifetime).toISOString() }) }));
  await page.goto(`/reset-password#realm=${realm.wire}&token=${secret}`);
  await expect(page.locator('#new-password')).toBeEnabled();
}
async function fillPassword(page: Page): Promise<void> {
  await page.locator('#new-password').fill('new-password-example');
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill('new-password-example');
}

test('request preserves a closed destination and returns neutral outcomes for either context', async ({ page }) => {
  await publicBoundary(page);
  const requests: unknown[] = [];
  await page.route('**/auth/recovery/requests', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ status: 202, json: body(Outcome.Accepted.wire, 202) }); });
  await page.goto('/login?returnTo=CUSTOMER_ORDERS');
  await page.getByRole('link', { name: 'Olvidé mi contraseña' }).click();
  await expect(page).toHaveURL(/\/recover\?returnTo=CUSTOMER_ORDERS$/);
  for (const realm of RecoveryRealm.all) for (const email of ['present@example.test', 'absent@example.test']) {
    await page.getByLabel('Acceso', { exact: true }).selectOption(realm.wire);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Solicitar enlace', exact: true }).click();
    await expect(page.getByText(Outcome.Accepted.label, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Corregir email o solicitar de nuevo' }).click();
  }
  expect(requests).toHaveLength(4);
  await page.getByRole('link', { name: 'Volver a ingresar' }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=CUSTOMER_ORDERS$/);
});

test('fragment is removed before inspect and never published or persisted; unknown realm never probes', async ({ page }) => {
  await publicBoundary(page);
  let inspections = 0;
  await page.route('**/auth/recovery/inspect', async route => {
    inspections++;
    expect(await page.evaluate(() => location.hash)).toBe('');
    await route.fulfill({ json: body(Outcome.Invalid.wire) });
  });
  const before = await page.goto('/reset-password#realm=unknown&token=malformed'); expect(before).toBeTruthy();
  await expect(page.getByText(Outcome.Invalid.label, { exact: true })).toBeVisible();
  expect(inspections).toBe(0); await expect(page).toHaveURL(/\/reset-password$/);
  await page.goto(`/reset-password#realm=customer&token=${secret}`);
  await expect(page.getByText(Outcome.Invalid.label, { exact: true })).toBeFocused();
  expect(inspections).toBe(1);
  expect(await page.locator('sc-root').getAttribute('data-surface-url')).toBe('/reset-password');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage, history: history.state }))).not.toContain(secret);
});

test('completion clears passwords, provides a recovered-realm login intent and never navigates automatically', async ({ page }) => {
  await publicBoundary(page);
  await page.route('**/auth/recovery/complete', route => route.fulfill({ json: body(Outcome.Completed.wire) }));
  await resetReady(page, RecoveryRealm.User); await fillPassword(page);
  await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
  await expect(page.getByText(Outcome.Completed.label, { exact: true })).toBeFocused();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByRole('link', { name: 'Volver a ingresar' }).click();
  await expect(page).toHaveURL(/recoveredRealm=user/);
  await expect(page.getByRole('heading', { name: 'Ingresar', exact: true })).toBeVisible();
});

test('fragment cleanup preserves delayed READY and reopens the same link on the reused route', async ({ page }) => {
  await publicBoundary(page);
  let inspections = 0;
  await page.route('**/auth/recovery/inspect', async route => {
    inspections++;
    await new Promise(resolve => setTimeout(resolve, 100));
    await route.fulfill({ json: body(Outcome.Ready.wire, 200, { expiresAt: new Date(Date.now() + 60_000).toISOString() }) });
  });
  await page.goto('/reset-password');
  await expect(page.getByText(Outcome.Invalid.label, { exact: true })).toBeVisible();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(fragment => { location.hash = fragment; }, `realm=customer&token=${secret}`);
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.locator('#new-password')).toBeEnabled();
    await expect(page.getByText(Outcome.Invalid.label, { exact: true })).toHaveCount(0);
    expect(inspections).toBe(attempt + 1);
  }
});

test('a direct initial token load keeps its component alive while READY arrives after URL cleanup', async ({ page }) => {
  await publicBoundary(page);
  await page.route('**/auth/recovery/inspect', async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ json: body(Outcome.Ready.wire, 200, { expiresAt: new Date(Date.now() + 60_000).toISOString() }) });
  });
  await page.goto(`/reset-password#realm=customer&token=${secret}`);
  await page.locator('sc-password-reset').evaluate(element => { element.setAttribute('data-instance-marker', 'initial'); });
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.locator('#new-password')).toBeEnabled();
  await expect(page.locator('sc-password-reset')).toHaveAttribute('data-instance-marker', 'initial');
  await expect(page.getByText(Outcome.Invalid.label, { exact: true })).toHaveCount(0);
});

for (const recovered of RecoveryRealm.all) for (const result of [Outcome.Completed, Outcome.Uncertain]) test(`same-email dual-session ${recovered.wire} reset ${result.wire} retains other access and accepts the recovered credential`, async ({ page }) => {
  const active = new Set(RecoveryRealm.all);
  const mutations: string[] = [];
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') mutations.push(path);
    if (path.endsWith('/recovery/inspect')) return route.fulfill({ json: body(Outcome.Ready.wire, 200, { expiresAt: new Date(Date.now() + 60_000).toISOString() }) });
    if (path.endsWith('/recovery/complete')) {
      active.delete(recovered); // The server applied the reset before a possibly lost response.
      return result === Outcome.Uncertain ? route.abort('failed') : route.fulfill({ json: body(Outcome.Completed.wire) });
    }
    if (path.endsWith('/auth/login')) {
      active.add(recovered);
      return route.fulfill({ headers: { 'X-CSRF-Token': `new-${recovered.wire}` }, json: body(LoginResolution.Authenticated.wire, 200, { context: recovered.context.wire, home: AccessHome.forContext(recovered.context).wire, destination: { kind: ReturnDestination.Home.wire } }) });
    }
    const realm = path.includes('/customer/') ? RecoveryRealm.Customer : RecoveryRealm.User;
    if (path.endsWith('/me')) {
      if (!active.has(realm)) return route.fulfill({ status: 401, json: { code: 401 } });
      return route.fulfill({ json: { code: 200, data: realm === RecoveryRealm.Customer ? { id: 'customer-1', email: 'same@example.test', firstName: 'Same', lastName: 'Person', phone: '' } : { id: 'user-1', roles: [UserRole.Operator.wire] } } });
    }
    if (path.endsWith('/auth/csrf')) return route.fulfill({ headers: { 'X-CSRF-Token': `csrf-${realm.wire}` }, json: { code: 200, data: {} } });
    return route.fulfill({ json: { code: 200, data: {} } });
  });
  await page.goto(`/reset-password#realm=${recovered.wire}&token=${secret}`);
  await expect(page.locator('#new-password')).toBeEnabled();
  await fillPassword(page); await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
  await expect(page.getByText(result.label, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a ingresar' }).click();
  const email = page.getByLabel('Email', { exact: true }); await expect(email).toBeEnabled();
  await expect(page).toHaveURL(/\/login\?/);
  await email.fill('same@example.test'); await page.getByLabel('Contraseña', { exact: true }).fill('new-password-example');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${AccessHome.forContext(recovered.context).route === '/' ? '/$' : '/user/home$'}`));
  expect(active.size).toBe(2); expect(mutations.some(path => path.endsWith('/logout'))).toBe(false);
});

for (const outcome of [Outcome.Invalid, Outcome.Expired, Outcome.Used, Outcome.Superseded]) {
  test(`terminal ${outcome.wire} cannot submit and offers a new link`, async ({ page }) => {
    await publicBoundary(page);
    await page.route('**/auth/recovery/inspect', route => route.fulfill({ json: body(outcome.wire) }));
    await page.goto(`/reset-password#realm=customer&token=${secret}`);
    await expect(page.getByText(outcome.label, { exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Actualizar contraseña' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Solicitar un nuevo enlace' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Volver a ingresar' })).toHaveAttribute('href', /recoveredRealm=customer/);
  });
}

test('an expired link replaces a stale password mismatch with a visible focused result', async ({ page }) => {
  await publicBoundary(page); await page.clock.install(); await resetReady(page, RecoveryRealm.Customer, 5000);
  await page.locator('#new-password').fill('new-password-example');
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
  await expect(page.locator('#recovery-error')).toBeFocused();
  await page.clock.fastForward(6000);
  await expect(page.getByText(Outcome.Expired.label, { exact: true })).toBeFocused();
  await expect(page.locator('#recovery-error')).toHaveCount(0);
});

test('unknown request response offers an explicit editable restart without automatic replay', async ({ page }) => {
  await publicBoundary(page);
  let calls = 0;
  await page.route('**/auth/recovery/requests', route => { calls++; return route.fulfill({ status: 202, json: body('FUTURE_OUTCOME', 202) }); });
  await page.goto('/recover');
  await page.getByLabel('Acceso', { exact: true }).selectOption(RecoveryRealm.User.wire);
  await page.getByLabel('Email', { exact: true }).fill('person@example.test');
  await page.getByRole('button', { name: 'Solicitar enlace', exact: true }).click();
  await expect(page.getByText(Outcome.Unknown.label, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Corregir email o solicitar de nuevo' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('person@example.test');
  expect(calls).toBe(1);
});

test('cooldown announces availability, expiration blocks editing, and lost completion stays uncertain', async ({ page }) => {
  await publicBoundary(page); await page.clock.install();
  let calls = 0;
  await page.route('**/auth/recovery/inspect', route => {
    calls++;
    return calls === 1 ? route.fulfill({ status: 429, headers: { 'Retry-After': '2' }, json: { code: 429, errorCode: Outcome.RateLimited.wire } }) : route.fulfill({ json: body(Outcome.Ready.wire, 200, { expiresAt: new Date(Date.now() + 5000).toISOString() }) });
  });
  await page.goto(`/reset-password#realm=customer&token=${secret}`);
  const retry = page.getByRole('button', { name: 'Volver a comprobar enlace' });
  await expect(retry).toBeDisabled(); await page.clock.fastForward(2100); await expect(retry).toBeEnabled(); await retry.click();
  await expect(page.locator('#new-password')).toBeEnabled();
  await page.clock.fastForward(6000); await expect(page.getByText(Outcome.Expired.label, { exact: true })).toBeVisible();
  await page.unroute('**/auth/recovery/inspect');
  await page.route('**/auth/recovery/complete', route => route.abort('failed'));
  await resetReady(page); await fillPassword(page); await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
  await expect(page.getByText(Outcome.Uncertain.label, { exact: true })).toBeVisible();
});

for (const width of [320, 1440]) test(`recovery keyboard, focus, labels and axe at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await publicBoundary(page);
  await page.goto('/recover'); await page.getByRole('button', { name: 'Solicitar enlace', exact: true }).click();
  await expect(page.locator('#recovery-error')).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await resetReady(page);
  await page.locator('#new-password').focus(); await page.keyboard.type('new-password-example');
  await page.keyboard.press('Tab'); await expect(page.getByLabel('Confirmar contraseña', { exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
