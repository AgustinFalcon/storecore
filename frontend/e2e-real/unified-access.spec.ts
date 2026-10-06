import { expect, test } from '@playwright/test';
import { UserRole } from '../src/app/domain/user/user-role';
import { UserAction } from '../src/app/features/admin/user-action';
import {
  AccessContext, LoginResolution, RealmFixture, apiLogin, assertRealm, challengeCookie,
  chooseExisting, decoded, establishBoth, loseRoles, secureCookies, select, sessionCount, uiLogin,
} from './support/fixtures';

test('CUSTOMER-only: browser cookie, owned CSRF and real profile mutation', async ({ page, context }) => {
  const result = await uiLogin(page, 'ua-customer@example.test');
  expect(result.resolution).toBe(LoginResolution.Authenticated);
  expect(result.context).toBe(AccessContext.Customer);
  await expect(page).toHaveURL(/\/customer\/profile$/);
  await assertRealm(page, RealmFixture.Customer);
  await assertRealm(page, RealmFixture.User, 401);
  await secureCookies(context, [RealmFixture.Customer]);
  expect((await context.cookies()).some((cookie) => cookie.name === RealmFixture.User.cookie)).toBe(false);
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('UA');
  await page.getByLabel('Nombre', { exact: true }).fill('Browser verified');
  const saved = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/v1/customer/me');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(response.request().headers()['x-csrf-token']).toBeTruthy();
  expect(response.headers()['x-csrf-token']).toBeTruthy();
  await expect(page.getByRole('status').filter({ hasText: 'Perfil actualizado' })).toBeVisible();
});

for (const role of [UserRole.Admin, UserRole.Operator]) {
  test(`USER-only: ${role.label} has a real role-derived home`, async ({ page, context }) => {
    const email = role === UserRole.Admin ? 'ua-user-admin@example.test' : 'ua-user-operator@example.test';
    const result = await uiLogin(page, email);
    expect(result.context).toBe(AccessContext.User);
    await expect(page).toHaveURL(/\/user\/home$/);
    await expect(page.getByRole('heading', { name: 'Inicio de operaciones' })).toBeVisible();
    const me = await page.request.get('/api/v1/internal/me');
    expect(me.status()).toBe(200);
    const roles = (await me.json()).data.roles.map(UserRole.fromWire);
    expect(roles).toEqual([role]);
    await assertRealm(page, RealmFixture.Customer, 401);
    await secureCookies(context, [RealmFixture.User]);
    expect((await context.cookies()).some((cookie) => cookie.name === RealmFixture.Customer.cookie)).toBe(false);
    const actions = page.locator('section[aria-labelledby="operations-title"] ul a');
    const permitted = UserAction.forRoles([role]);
    await expect(actions).toHaveCount(permitted.length);
    for (const action of permitted) await expect(actions.filter({ hasText: action.label })).toHaveAttribute('href', action.path);
    if (role === UserRole.Operator) await expect(actions.filter({ hasText: UserAction.Capabilities.label })).toHaveCount(0);
  });
}

for (const contextChoice of [AccessContext.Customer, AccessContext.User]) {
  test(`dual same credentials: challenge chooses ${contextChoice.label}`, async ({ page, context }) => {
    const email = contextChoice === AccessContext.Customer ? 'ua-dual-customer@example.test' : 'ua-dual-user@example.test';
    const before = sessionCount();
    const pending = await uiLogin(page, email);
    expect(pending.resolution).toBe(LoginResolution.ContextSelectionRequired);
    expect(sessionCount()).toBe(before);
    await expect(page.getByRole('heading', { name: 'Elegí cómo continuar' })).toBeVisible();
    const binding = (await context.cookies()).find((cookie) => cookie.name === challengeCookie);
    expect(binding).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
    await page.getByRole('button', { name: contextChoice.label, exact: true }).click();
    const selected = RealmFixture.forContext(contextChoice);
    await expect(page).toHaveURL(new RegExp(`${selected.route}$`));
    await secureCookies(context, [selected]);
    await assertRealm(page, selected);
    await assertRealm(page, RealmFixture.forContext(contextChoice === AccessContext.Customer ? AccessContext.User : AccessContext.Customer), 401);
    expect(sessionCount()).toBe(before + 1);
  });
}

test('dual pre-existing sessions rehydrate and choose locally without a challenge or new session', async ({ page, context }) => {
  await establishBoth(page, 'ua-existing@example.test');
  const before = sessionCount();
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/v1/auth/')) mutations.push(request.url());
  });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Elegí cómo continuar' })).toBeVisible();
  await page.getByRole('button', { name: AccessContext.User.label, exact: true }).click();
  await expect(page).toHaveURL(/\/user\/home$/);
  await assertRealm(page, RealmFixture.Customer);
  await assertRealm(page, RealmFixture.User);
  await secureCookies(context, [RealmFixture.Customer, RealmFixture.User]);
  expect(mutations).toEqual([]);
  expect(sessionCount()).toBe(before);
});

test('consumed challenge replay issues no new session and preserves both live sessions', async ({ page, context }) => {
  await establishBoth(page, 'ua-replay@example.test');
  const pending = await apiLogin(page, 'ua-replay@example.test');
  const binding = (await context.cookies()).find((cookie) => cookie.name === challengeCookie)!.value;
  await decoded(await select(page, pending.challenge!, AccessContext.User));
  const before = sessionCount();
  expect((await select(page, pending.challenge!, AccessContext.Customer, binding)).status()).toBe(401);
  expect(sessionCount()).toBe(before);
  await assertRealm(page, RealmFixture.Customer);
  await assertRealm(page, RealmFixture.User);
});

test('real 120-second expiry rejects browser selection and preserves existing sessions', async ({ page, context }) => {
  test.setTimeout(165_000);
  const pending = await uiLogin(page, 'ua-expiry@example.test');
  expect(pending.resolution).toBe(LoginResolution.ContextSelectionRequired);
  const binding = (await context.cookies()).find((cookie) => cookie.name === challengeCookie)!.value;
  await establishBoth(page, 'ua-expiry@example.test');
  const before = sessionCount();
  const delay = Date.parse(pending.expiresAt!) - Date.now() + 1500;
  expect(delay).toBeGreaterThan(0);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
  // Sending the original nonce explicitly also proves server expiry, independently of cookie expiry.
  expect((await select(page, pending.challenge!, AccessContext.Customer, binding)).status()).toBe(401);
  const rejected = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/auth/context-selection');
  await page.getByRole('button', { name: AccessContext.Customer.label, exact: true }).click();
  expect((await rejected).status()).toBe(401);
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled();
  expect(sessionCount()).toBe(before);
  await assertRealm(page, RealmFixture.Customer);
  await assertRealm(page, RealmFixture.User);
});

for (const realm of [RealmFixture.Customer, RealmFixture.User]) {
  test(`logout ${realm.context.label} uses its CSRF and leaves the other realm live`, async ({ page, context }) => {
    const email = realm === RealmFixture.Customer ? 'ua-logout-customer@example.test' : 'ua-logout-user@example.test';
    await establishBoth(page, email);
    const other = realm === RealmFixture.Customer ? RealmFixture.User : RealmFixture.Customer;
    const beforeCookie = (await context.cookies()).find((cookie) => cookie.name === other.cookie)!.value;
    await chooseExisting(page, realm);
    await expect(page.getByRole('button', { name: 'Salir', exact: true })).toBeEnabled();
    const loggedOut = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/${realm.path}/auth/logout`);
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    const response = await loggedOut;
    expect(response.status()).toBe(204);
    expect(response.request().headers()['x-csrf-token']).toBeTruthy();
    await assertRealm(page, realm, 401);
    await assertRealm(page, other);
    expect((await context.cookies()).find((cookie) => cookie.name === other.cookie)?.value).toBe(beforeCookie);
    await page.goto(other.route);
    await expect(page).toHaveURL(new RegExp(`${other.route}$`));
  });
}

test('live USER role loss denies its route and keeps CUSTOMER authority', async ({ page }) => {
  await establishBoth(page, 'ua-role-loss@example.test');
  await chooseExisting(page, RealmFixture.User);
  await expect(page.getByRole('heading', { name: 'Inicio de operaciones' })).toBeVisible();
  loseRoles('ua-role-loss@example.test');
  await assertRealm(page, RealmFixture.User, 401);
  await page.reload();
  await expect(page).not.toHaveURL(/\/user\/home$/);
  await expect(page.getByRole('heading', { name: 'Inicio de operaciones' })).toHaveCount(0);
  await assertRealm(page, RealmFixture.Customer);
  await page.goto('/customer/profile');
  await expect(page).toHaveURL(/\/customer\/profile$/);
});

test('USER role loss before challenge selection fails atomically; CUSTOMER remains selectable', async ({ page, context }) => {
  const pending = await uiLogin(page, 'ua-selection-role-loss@example.test');
  const binding = (await context.cookies()).find((cookie) => cookie.name === challengeCookie)!.value;
  loseRoles('ua-selection-role-loss@example.test');
  const before = sessionCount();
  expect((await select(page, pending.challenge!, AccessContext.User)).status()).toBe(401);
  expect(sessionCount()).toBe(before);
  const selected = await decoded(await select(page, pending.challenge!, AccessContext.Customer, binding));
  expect(selected.context).toBe(AccessContext.Customer);
  await assertRealm(page, RealmFixture.Customer);
  await assertRealm(page, RealmFixture.User, 401);
});
