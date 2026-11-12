import { chromium, type Page, type BrowserContext, type Response } from '@playwright/test';
import { createInterface } from 'node:readline';

enum Realm { Customer = 'customer', User = 'user' }
enum Fixture { Customer = 'CUSTOMER_CASE', User = 'USER_CASE' }
enum Phase { Start = 'START', Sessions = 'SESSION_SETUP', Request = 'REQUEST', Capture = 'CAPTURE', Inspect = 'INSPECT', InspectResponse = 'INSPECT_RESPONSE', InspectForm = 'INSPECT_FORM', InspectFragment = 'INSPECT_FRAGMENT', InspectStorage = 'INSPECT_STORAGE', Complete = 'COMPLETE', Preservation = 'PRESERVATION', Login = 'LOGIN', Replay = 'REPLAY' }
let phase = Phase.Start;
enum Finding { Ready = 'READY', Invalid = 'INVALID', Expired = 'EXPIRED', Unknown = 'UNKNOWN', Unavailable = 'UNAVAILABLE', Loading = 'LOADING', NoMatch = 'NO_MATCH' }
enum RouteFinding { Login = 'LOGIN', Reset = 'RESET', Home = 'HOME', CustomerProfile = 'CUSTOMER_PROFILE', UserHome = 'USER_HOME', Other = 'OTHER' }
enum ExpiryFinding { Future = 'ISO_FUTURE', Past = 'ISO_PAST', Number = 'NUMBER', Absent = 'ABSENT', Unknown = 'UNKNOWN' }
let finding = Finding.NoMatch, routeFinding = RouteFinding.Other, expiryFinding = ExpiryFinding.Unknown;
function findOutcome(text: string): Finding {
  const known = new Map([
    ['Elegí tu nueva contraseña.', Finding.Ready],
    ['El enlace no es válido. Solicitá uno nuevo.', Finding.Invalid],
    ['El enlace venció. Solicitá uno nuevo.', Finding.Expired],
    ['No pudimos interpretar la respuesta. Volvé a iniciar la recuperación.', Finding.Unknown],
    ['La recuperación no está disponible. Volvé a intentarlo más tarde.', Finding.Unavailable],
    ['Comprobando enlace…', Finding.Loading],
  ]);
  return [...known.entries()].find(([label]) => text.includes(label))?.[1] ?? Finding.NoMatch;
}
class RecoveryCase {
  private constructor(readonly fixture: Fixture, readonly realm: Realm, readonly email: string, readonly path: string, readonly otherPath: string, readonly cookie: string, readonly otherCookie: string) {}
  static readonly Customer = new RecoveryCase(Fixture.Customer, Realm.Customer, 'ar016-customer@example.test', 'customer', 'internal', '__Host-storecore-customer', '__Host-storecore-internal');
  static readonly User = new RecoveryCase(Fixture.User, Realm.User, 'ar016-user@example.test', 'internal', 'customer', '__Host-storecore-internal', '__Host-storecore-customer');
  static readonly all = [this.Customer, this.User];
}
class Outcome {
  private constructor(readonly wire: string) {}
  static readonly Accepted = new Outcome('ACCEPTED');
  static readonly Ready = new Outcome('READY');
  static readonly Completed = new Outcome('COMPLETED');
  static readonly Used = new Outcome('USED_LINK');
  static readonly Unknown = new Outcome('');
  static fromWire(raw: unknown): Outcome { return [this.Accepted, this.Ready, this.Completed, this.Used].find(value => value.wire === raw) ?? this.Unknown; }
}
const origin = 'https://localhost:4301';
const original = 'ar016-original-password-2026';
const input = createInterface({ input: process.stdin, terminal: false });
let nextId = 0;
function check(condition: boolean): asserts condition { if (!condition) throw new Error('Recovery assertion failed'); }
async function capture(fixture: Fixture): Promise<string> {
  const requestId = ++nextId;
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Capture timed out')), 10_000);
    input.once('line', line => {
      clearTimeout(timeout);
      try {
        const value: unknown = JSON.parse(line);
        check(typeof value === 'object' && value !== null);
        const frame = value as Record<string, unknown>;
        check(Object.keys(frame).length === 2 && frame['requestId'] === requestId && typeof frame['token'] === 'string' && /^[A-Za-z0-9_-]{43}$/.test(frame['token']));
        resolve(frame['token']);
      } catch { reject(new Error('Invalid private capture frame')); }
    });
    process.stdout.write(JSON.stringify({ kind: 'CAPTURE', requestId, fixture }) + '\n');
  });
}
async function outcome(response: Response): Promise<Outcome> {
  const raw: unknown = await response.json();
  if (!raw || typeof raw !== 'object') return Outcome.Unknown;
  const data = (raw as Record<string, unknown>)['data'];
  return data && typeof data === 'object' ? Outcome.fromWire((data as Record<string, unknown>)['kind']) : Outcome.Unknown;
}
function responseFor(page: Page, path: string): Promise<Response> {
  return page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
}
async function establishBoth(context: BrowserContext, scenario: RecoveryCase): Promise<void> {
  for (const path of ['customer', 'internal']) {
    const response = await context.request.post(origin + '/api/v1/' + path + '/auth/login', { headers: { Origin: origin }, data: { email: scenario.email, password: original }, maxRetries: 0 });
    check(response.status() === 200);
  }
}
async function scenario(page: Page, context: BrowserContext, value: RecoveryCase): Promise<void> {
  phase = Phase.Sessions;
  await establishBoth(context, value);
  const before = await context.cookies();
  const preserved = before.find(cookie => cookie.name === value.otherCookie)?.value;
  check(Boolean(preserved) && before.some(cookie => cookie.name === value.cookie));
  await page.goto(origin + '/login');
  await page.getByRole('heading', { name: 'Elegí cómo continuar', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  await page.waitForURL(url => url.pathname !== '/login');
  await page.goto(origin + '/customer/profile');
  await page.getByRole('heading', { name: 'Perfil customer', exact: true }).waitFor({ state: 'visible' });
  await page.goto(origin + '/recover');
  phase = Phase.Request;
  await page.getByLabel('Acceso', { exact: true }).selectOption(value.realm);
  await page.getByLabel('Email', { exact: true }).fill(value.email);
  const requested = responseFor(page, '/api/v1/' + value.path + '/auth/recovery/requests');
  await page.getByRole('button', { name: 'Solicitar enlace', exact: true }).click();
  const accepted = await requested;
  check(accepted.status() === 202 && await outcome(accepted) === Outcome.Accepted);
  phase = Phase.Capture;
  const token = await capture(value.fixture);
  phase = Phase.Inspect;
  const inspected = responseFor(page, '/api/v1/' + value.path + '/auth/recovery/inspect');
  await page.goto(origin + '/reset-password#realm=' + value.realm + '&token=' + token);
  phase = Phase.InspectResponse;
  const inspection = await inspected;
  check(inspection.status() === 200);
  try {
    const envelope = await inspection.json() as { data?: { expiresAt?: unknown } };
    const expiry = envelope.data?.expiresAt;
    expiryFinding = typeof expiry === 'number' ? ExpiryFinding.Number : expiry === undefined ? ExpiryFinding.Absent
      : typeof expiry === 'string' && Number.isFinite(Date.parse(expiry)) ? Date.parse(expiry) > Date.now() ? ExpiryFinding.Future : ExpiryFinding.Past : ExpiryFinding.Unknown;
  } catch { expiryFinding = ExpiryFinding.Unknown; }
  phase = Phase.InspectForm;
  try { await page.getByText('Elegí tu nueva contraseña.', { exact: true }).waitFor(); }
  catch {
    finding = findOutcome((await page.locator('[role="status"]').allTextContents()).join('').trim());
    const path = new URL(page.url()).pathname;
    routeFinding = path === '/reset-password' ? RouteFinding.Reset : path === '/login' ? RouteFinding.Login : path === '/' ? RouteFinding.Home
      : path === '/customer/profile' ? RouteFinding.CustomerProfile : path === '/user/home' ? RouteFinding.UserHome : RouteFinding.Other;
    throw new Error('Recovery UI finding');
  }
  await page.locator('#new-password').waitFor({ state: 'visible' });
  await page.waitForFunction(() => { const field = document.querySelector<HTMLInputElement>('#new-password'); return Boolean(field && !field.disabled); });
  phase = Phase.InspectFragment;
  check(new URL(page.url()).hash === '');
  phase = Phase.InspectStorage;
  check(!await page.evaluate(secret => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }).includes(secret), token));
  const replacement = 'ar016-updated-' + value.realm + '-password-2026';
  phase = Phase.Complete;
  await page.locator('#new-password').fill(replacement);
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill(replacement);
  const completed = responseFor(page, '/api/v1/' + value.path + '/auth/recovery/complete');
  await page.getByRole('button', { name: 'Actualizar contraseña', exact: true }).click();
  check((await completed).status() === 200);
  await page.getByText('Contraseña actualizada. Podés ingresar con tu nueva contraseña.', { exact: true }).waitFor();
  const after = await context.cookies();
  phase = Phase.Preservation;
  check(!after.some(cookie => cookie.name === value.cookie));
  check(after.find(cookie => cookie.name === value.otherCookie)?.value === preserved);
  check((await context.request.get(origin + '/api/v1/' + value.path + '/me')).status() === 401);
  check((await context.request.get(origin + '/api/v1/' + value.otherPath + '/me')).status() === 200);
  const oldPassword = await context.request.post(origin + '/api/v1/' + value.path + '/auth/login', { headers: { Origin: origin }, data: { email: value.email, password: original }, maxRetries: 0 });
  check(oldPassword.status() === 401);
  phase = Phase.Login;
  await page.getByRole('link', { name: 'Volver a ingresar', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(value.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(replacement);
  const login = responseFor(page, '/api/v1/auth/login');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  check((await login).status() === 200);
  await page.waitForURL(url => url.pathname !== '/login');
  check((await context.request.get(origin + '/api/v1/' + value.path + '/me')).status() === 200);
  check((await context.cookies()).find(cookie => cookie.name === value.otherCookie)?.value === preserved);
  phase = Phase.Replay;
  const replay = responseFor(page, '/api/v1/' + value.path + '/auth/recovery/inspect');
  await page.goto(origin + '/reset-password#realm=' + value.realm + '&token=' + token);
  check((await replay).status() === 200);
  await page.getByText('El enlace ya fue utilizado. Intentá ingresar o solicitá uno nuevo.', { exact: true }).waitFor();
  check(new URL(page.url()).hash === '');
}
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  for (const value of RecoveryCase.all) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try { const page = await context.newPage(); page.setDefaultTimeout(15_000); await scenario(page, context, value); }
    finally { await context.close(); }
  }
  process.stdout.write(JSON.stringify({ kind: 'RESULT', passed: 2 }) + '\n');
} catch {
  // Deliberately omit Playwright errors/stacks: they may contain URLs or passwords.
  process.exitCode = 1;
  process.stdout.write(JSON.stringify({ kind: 'FAILED', phase, finding, route: routeFinding, expiry: expiryFinding }) + '\n');
} finally {
  input.close();
  if (browser) await browser.close().catch(() => undefined);
}
