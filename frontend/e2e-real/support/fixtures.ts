import { execFileSync } from 'node:child_process';
import { expect, type APIResponse, type BrowserContext, type Page } from '@playwright/test';
import { AccessContext } from '../../src/app/domain/access/access-context';
import { LoginResolution, type LoginResult } from '../../src/app/domain/access/login-resolution';
import { mapAccessResponse } from '../../src/app/data/mappers/access-http.mapper';
import { ReturnDestination } from '../../src/app/domain/access/return-destination';

export const origin = 'https://localhost:4301';
export const password = 'ua-fixture-password-2026';
export const challengeCookie = '__Host-storecore_access_challenge';
export { AccessContext, LoginResolution };

/** Realm metadata is keyed by the production closed type, never inferred from wire text. */
export class RealmFixture {
  private constructor(readonly context: AccessContext, readonly path: string, readonly cookie: string, readonly route: string) {}
  static readonly Customer = new RealmFixture(AccessContext.Customer, 'customer', '__Host-storecore-customer', '/customer/profile');
  static readonly User = new RealmFixture(AccessContext.User, 'internal', '__Host-storecore-internal', '/user/home');
  static forContext(context: AccessContext): RealmFixture {
    if (context === AccessContext.Customer) return RealmFixture.Customer;
    if (context === AccessContext.User) return RealmFixture.User;
    throw new Error('Unknown fixture realm');
  }
}

export function database(sql: string): string {
  if (process.env['PGDATABASE'] !== 'storecore_ua_e2e') throw new Error('Use test:ua-real with a dedicated database');
  if (!['127.0.0.1', 'localhost'].includes(process.env['PGHOST'] ?? '')) throw new Error('UA database must be on loopback');
  return execFileSync(process.env['STORECORE_UA_PSQL'] ?? 'psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t'],
    { env: process.env, input: sql, encoding: 'utf8', timeout: 30_000 }).trim();
}
export function loseRoles(email: string): void {
  if (!/^ua-[a-z-]+@example\.test$/.test(email)) throw new Error('Only named UA fixtures may lose roles');
  database(`DELETE FROM user_roles WHERE user_id=(SELECT id FROM users WHERE email='${email}');`);
}
export function sessionCount(): number { return Number(database('SELECT count(*) FROM identity_sessions;')); }

export async function decoded(response: APIResponse): Promise<LoginResult> {
  expect(response.status()).toBe(200);
  const result = mapAccessResponse(await response.json());
  expect(result.resolution).not.toBe(LoginResolution.Unknown);
  return result;
}
export async function apiLogin(page: Page, email: string): Promise<LoginResult> {
  return decoded(await page.request.post('/api/v1/auth/login', { headers: { Origin: origin }, data: { email, password } }));
}
export async function select(page: Page, challenge: string, context: AccessContext, binding?: string): Promise<APIResponse> {
  return page.request.post('/api/v1/auth/context-selection', {
    headers: { Origin: origin, ...(binding ? { Cookie: `${challengeCookie}=${binding}` } : {}) },
    data: { challenge, context: context.wire },
  });
}
export async function establishBoth(page: Page, email: string): Promise<void> {
  for (const context of [AccessContext.Customer, AccessContext.User]) {
    const pending = await apiLogin(page, email);
    expect(pending.resolution).toBe(LoginResolution.ContextSelectionRequired);
    const result = await decoded(await select(page, pending.challenge!, context));
    expect(result.context).toBe(context);
  }
}
export async function chooseExisting(page: Page, realm: RealmFixture): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Elegí cómo continuar' })).toBeVisible();
  await page.getByRole('button', { name: realm.context.label, exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto(realm.route);
  await expect(page).toHaveURL(new RegExp(`${realm.route}$`));
}
export async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto(`/login?returnTo=${ReturnDestination.CustomerProfile.wire}`);
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  // Angular can navigate in the same task that completes its XHR. Chromium may
  // then discard the body, so browser cases assert the resulting route/session
  // instead of rereading a payload already consumed by the application.
  const response = page.waitForResponse((candidate) => new URL(candidate.url()).pathname === '/api/v1/auth/login');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  const completed = await response;
  expect(completed.status()).toBe(200);
}
export async function assertRealm(page: Page, realm: RealmFixture, status = 200): Promise<void> {
  expect((await page.request.get(`/api/v1/${realm.path}/me`)).status()).toBe(status);
}
export async function secureCookies(context: BrowserContext, realms: readonly RealmFixture[]): Promise<void> {
  const cookies = await context.cookies();
  for (const realm of realms) {
    const cookie = cookies.find((item) => item.name === realm.cookie);
    expect(cookie).toBeDefined();
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
  }
}
