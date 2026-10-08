import { expect, test, type Page } from '@playwright/test';
import { AccessContext } from '../src/app/domain/access/access-context';
import { LoginResolution } from '../src/app/domain/access/login-resolution';
import { mapAccessResponse } from '../src/app/data/mappers/access-http.mapper';
import { mapAccessPrincipal } from '../src/app/data/mappers/access-session.mapper';
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

/** No routing/interception, retry, host alternation, rate resets or commerce mutation. */
test('RealLocal UA credentials, cookies, reload readback and realm logout smoke', async ({ page, context, browser }, info) => {
  const credentials = [
    { context: AccessContext.Customer, email: process.env['STORECORE_UA_CUSTOMER_EMAIL'], password: process.env['STORECORE_UA_CUSTOMER_PASSWORD'] },
    { context: AccessContext.User, email: process.env['STORECORE_UA_USER_EMAIL'], password: process.env['STORECORE_UA_USER_PASSWORD'] },
  ];
  if (credentials.some(row => !row.email || !row.password)) throw new Error('Seeded CUSTOMER and USER credentials are required.');
  const attempts = new Map<AccessContext, number>();
  let selectionAttempts = 0;
  const cookieNames = new Map([
    [AccessContext.Customer, '__Host-storecore-customer'], [AccessContext.User, '__Host-storecore-internal'],
  ]);
  const realmPaths = new Map([[AccessContext.Customer, 'customer'], [AccessContext.User, 'internal']]);
  const apiPath = (response: { url(): string }, path: string) => new URL(response.url()).pathname === `/api/v1/${path}`;

  async function captureProbe(page: Page, realm: AccessContext) {
    const path = realmPaths.get(realm);
    const response = await page.waitForResponse(response => apiPath(response, `${path}/me`) && response.request().method() === 'GET');
    expect(response.status()).toBe(200);
    const envelope = await response.json() as { data: unknown };
    const principal = mapAccessPrincipal(realm, envelope.data);
    expect(principal?.id).toBeTruthy();
    return principal;
  }

  for (const row of credentials) {
    await page.goto('/login');
    await expect(page.getByLabel('Email', { exact: true })).toBeEnabled();
    await page.getByLabel('Email', { exact: true }).fill(row.email!);
    await page.getByLabel('Contraseña', { exact: true }).fill(row.password!);
    attempts.set(row.context, (attempts.get(row.context) ?? 0) + 1);
    const response = page.waitForResponse(response => apiPath(response, 'auth/login') && response.request().method() === 'POST');
    const acceptedProbe = captureProbe(page, row.context);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    const login = await response;
    expect(login.status()).toBe(200); expect(login.headers()['cache-control']).toContain('no-store');
    const result = mapAccessResponse(await login.json());
    if (result.resolution === LoginResolution.ContextSelectionRequired) {
      expect(result.contexts).toContain(row.context);
      ++selectionAttempts;
      await page.getByRole('button', { name: row.context.label, exact: true }).click();
    } else {
      expect(result.resolution).toBe(LoginResolution.Authenticated); expect(result.context).toBe(row.context);
    }
    const firstActor = await acceptedProbe;
    const cookieName = cookieNames.get(row.context)!;
    const cookie = (await context.cookies()).find(cookie => cookie.name === cookieName);
    expect(cookie?.secure).toBe(true); expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.path).toBe('/'); expect(cookie?.domain).toBe('127.0.0.1');
    expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000);
    expect(cookie!.expires - Date.now() / 1000).toBeLessThanOrEqual(43_200);
    const reloadActor = captureProbe(page, row.context); await page.reload();
    expect((await reloadActor)?.id).toBe(firstActor?.id);
    await page.goto(row.context === AccessContext.Customer ? '/customer/profile' : '/user/home');
    const logout = page.waitForResponse(response => apiPath(response, `${realmPaths.get(row.context)}/auth/logout`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    expect((await logout).status()).toBe(200);
    await expect(page).toHaveURL('/login');
    expect((await context.cookies()).some(cookie => cookie.name === cookieName)).toBe(false);
  }
  await info.attach('ua-smoke-mode-and-budget', { contentType: 'application/json', body: JSON.stringify({
    mode: 'RealLocal', browser: browser.version(),
    attempts: [...attempts].map(([context, count]) => ({ context: context.wire, count })),
    loginAttemptTotal: [...attempts.values()].reduce((sum, count) => sum + count, 0), selectionAttemptTotal: selectionAttempts,
    dbConcordance: 'NOT_RUN', cookieRaces: 'NOT_RUN', negativeAdmission: 'NOT_RUN',
  }) });
});
