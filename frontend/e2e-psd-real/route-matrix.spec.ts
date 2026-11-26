import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import { AccessContext } from '../src/app/domain/access/access-context';
import { RecoveryOutcome } from '../src/app/domain/access/recovery';
import { VerificationOutcome } from '../src/app/domain/access/email-verification';
import { SurfaceIdentity } from '../src/app/domain/navigation/surface-identity';
import { ReturnDestination } from '../src/app/domain/access/return-destination';
import { readApiBody } from '../src/app/core/api/base-response';
import { mapUserSession } from '../src/app/data/mappers/http-mappers';
import { UserRole } from '../src/app/domain/user/user-role';
import { bindProductiveRealRoutes, productiveRouteDefinitions, RouteActor, RouteEvidenceMode, RouteGateResult, type ProductiveRouteAcceptance } from '../src/app/features/navigation/productive-route-manifest';
import { RealRouteReceipt } from '../src/app/features/navigation/real-fixture-receipt';
import { AccessibilityImpact, assertReflow, measureReflow, RealReadTrace, requiredReads,
  type SafeReflowDiagnostic } from './route-matrix-support';
import { origin } from './support';

const contexts = new Map<RouteActor, BrowserContext>();
let receipt: RealRouteReceipt;
let bindings: readonly ProductiveRouteAcceptance[];

// Contexts survive tests in memory only. Global setup authenticates each principal
// once so worker restarts cannot consume the real five-attempt/15-minute budget.
test.beforeAll(async ({ browser }) => {
  receipt = RealRouteReceipt.fromWire(JSON.parse(readFileSync(resolve('psd-real-results/fixture-receipt.json'), 'utf8')));
  bindings = bindProductiveRealRoutes(receipt);
  expect(bindings).toHaveLength(37);
  for (const actor of [RouteActor.Anonymous, RouteActor.Customer, RouteActor.Admin, RouteActor.Operator]) {
    const authDir = process.env['STORECORE_PSD_AUTH_DIR'];
    if (!authDir) throw new Error('Missing ephemeral route auth directory');
    const storageState = actor === RouteActor.Anonymous ? undefined : join(authDir, `${actor.wire}.json`);
    const context = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true, storageState });
    contexts.set(actor, context);
    if (actor === RouteActor.Anonymous) continue;
    const page = await context.newPage();
    try {
      const own = actor === RouteActor.Customer ? 'customer' : 'internal';
      const other = actor === RouteActor.Customer ? 'internal' : 'customer';
      const principal = await page.request.get(`/api/v1/${own}/me`);
      expect(principal.status()).toBe(200);
      if (actor === RouteActor.Admin || actor === RouteActor.Operator) {
        const session = mapUserSession(readApiBody(await principal.json()));
        expect(session.roles).toEqual([actor === RouteActor.Admin ? UserRole.Admin : UserRole.Operator]);
      } else {
        const customer = readApiBody<{ id: number; email: string }>(await principal.json());
        expect(String(customer.id)).toBe(String(receipt.customerId));
        expect(customer.email).toBe(receipt.customerEmail);
      }
      expect((await page.request.get(`/api/v1/${other}/me`)).status()).toBe(401);
      const cookies = await context.cookies();
      const ownCookie = cookies.find(cookie => cookie.name === `__Host-storecore-${own}`);
      expect(ownCookie ? { httpOnly: ownCookie.httpOnly, secure: ownCookie.secure, sameSite: ownCookie.sameSite, path: ownCookie.path } : null)
        .toEqual({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
      expect(cookies.some(cookie => cookie.name === `__Host-storecore-${other}`)).toBe(false);
    } finally { await page.close(); }
  }
});

test.afterAll(async () => {
  await Promise.all([...contexts.values()].map(context => context.close()));
  contexts.clear();
});

for (const width of [390, 768, 1440]) {
  for (const definition of productiveRouteDefinitions) {
    test(`REAL_BACKEND ${width}px ${definition.pattern || '/'} ${definition.scenario.wire}`, async ({ browser }, testInfo) => {
      expect(browser.isConnected()).toBe(true);
      const binding = bindings.find(item => item.pattern === definition.pattern);
      if (!binding) throw new Error('Missing real binding');
      expect(binding.evidence).toBe(RouteEvidenceMode.RealBackend);
      const context = contexts.get(binding.actor);
      if (!context) throw new Error('Unknown matrix actor');
      const page = await context.newPage();
      const trace = new RealReadTrace(page);
      let reflow: SafeReflowDiagnostic | null = null;
      let axeBlocking: readonly { id: string; impact: string; nodeCount: number }[] = [];
      try {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(binding.url, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(new URL(binding.finalUrl, origin).href);
        await expect(page.locator('sc-root')).toHaveAttribute('data-surface-id', binding.surface.wire);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('h1')).toHaveText(binding.heading);
        await expect(page.locator(binding.readiness).first()).toBeVisible();
        await trace.ready(requiredReads(binding, receipt));
        await expect(page.locator('[aria-busy="true"], .status--loading')).toHaveCount(0);
        await expect(page.locator('[role="alert"]')).toHaveCount(0);
        if (binding.surface === SurfaceIdentity.Profile) await expect(page.locator('input[name="profileEmail"]')).toHaveValue(receipt.customerEmail);
        if (binding.surface === SurfaceIdentity.CommercialCalendarEdit) {
          await expect(page.locator('input[name="title"]')).toHaveValue(receipt.commercialCalendar!.title);
        }
        if (binding.surface === SurfaceIdentity.CommercialCalendarNew) {
          await expect(page.locator('input[name="title"]')).toHaveValue('');
        }
        if (binding.pattern === 'reset-password') await expect(page.getByText(RecoveryOutcome.Invalid.label, { exact: true })).toBeVisible();
        if (binding.surface === SurfaceIdentity.EmailVerification) await expect(page.getByText(VerificationOutcome.Invalid.label, { exact: true })).toBeVisible();
        const skip = page.getByRole('link', { name: 'Saltar al contenido' });
        await skip.focus();
        await expect(skip).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('main')).toBeFocused();
        await expect(page).toHaveURL(new URL(binding.finalUrl, origin).href);
        await expect(page.locator('sc-root')).toHaveAttribute('data-surface-id', binding.surface.wire);
        reflow = await measureReflow(page);
        const axe = await new AxeBuilder({ page }).analyze();
        const blocking = axe.violations.filter(item => AccessibilityImpact.fromWire(item.impact).blocking);
        axeBlocking = blocking.map(item => ({ id: item.id, impact: AccessibilityImpact.fromWire(item.impact).wire,
          nodeCount: item.nodes.length }));
        await assertReflow(page, reflow);
        expect(blocking.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
        await testInfo.attach('real-route-acceptance', { contentType: 'application/json', body: JSON.stringify({
          pattern: binding.pattern, width, actor: binding.actor.wire, evidence: binding.evidence.wire,
          surface: binding.surface.wire, finalUrl: binding.finalUrl, result: RouteGateResult.Accepted.wire,
          responses: trace.completed, axeBlocking: blocking.length,
        }) });
      } finally {
        await testInfo.attach('real-route-diagnostic', { contentType: 'application/json', body: JSON.stringify({
          pattern: binding.pattern, width, ...trace.snapshot(page.url()), reflow, axe: axeBlocking,
        }) });
        await page.close();
      }
    });
  }
}

const redirects = [
  { input: '/customer', final: '/login', actor: RouteActor.Anonymous, surface: SurfaceIdentity.Login },
  { input: `/customer/session?returnTo=${ReturnDestination.CustomerOrders.wire}`, final: `/login?returnTo=${ReturnDestination.CustomerOrders.wire}`, actor: RouteActor.Anonymous, surface: SurfaceIdentity.Login },
  { input: '/user', final: '/user/home', actor: RouteActor.Admin, surface: SurfaceIdentity.Overview },
  { input: `/user/session?returnTo=${ReturnDestination.UserOrders.wire}`, final: `/login?returnTo=${ReturnDestination.UserOrders.wire}`, actor: RouteActor.Anonymous, surface: SurfaceIdentity.Login },
] as const;

for (const redirect of redirects) {
  test(`real redirect ${redirect.input}`, async () => {
    const context = contexts.get(redirect.actor)!;
    const page = await context.newPage();
    try {
      const trace = new RealReadTrace(page);
      await page.goto(redirect.input);
      await expect(page).toHaveURL(new URL(redirect.final, origin).href);
      await expect(page.locator('sc-root')).toHaveAttribute('data-surface-id', redirect.surface.wire);
      await expect(page.locator('h1')).toHaveCount(1);
      await trace.ready(['health', 'storefront/branding', ...(redirect.actor === RouteActor.Admin ? ['user/overview'] : [])]);
    } finally { await page.close(); }
  });
}

for (const path of ['/prm-missing-route', '/customer/prm-missing-route', '/user/prm-missing-route']) {
  test(`real wildcard ${path}`, async () => {
    const page = await contexts.get(RouteActor.Anonymous)!.newPage();
    try {
      const trace = new RealReadTrace(page);
      await page.goto(path);
      await expect(page).toHaveURL(new URL(path, origin).href);
      await expect(page.locator('sc-root')).toHaveAttribute('data-surface-id', SurfaceIdentity.Unknown.wire);
      await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada', exact: true })).toBeFocused();
      await expect(page.locator('h1')).toHaveCount(1);
      await trace.ready(['health', 'storefront/branding']);
    } finally { await page.close(); }
  });
}

test('real contexts retain separate CUSTOMER and USER authority', async () => {
  for (const actor of [RouteActor.Customer, RouteActor.Admin, RouteActor.Operator]) {
    const context = contexts.get(actor)!;
    const own = actor.context === AccessContext.Customer ? 'customer' : 'internal';
    const other = actor.context === AccessContext.Customer ? 'internal' : 'customer';
    expect((await context.request.get(`/api/v1/${own}/me`)).status()).toBe(200);
    expect((await context.request.get(`/api/v1/${other}/me`)).status()).toBe(401);
  }
});

for (const path of ['/customer/profile', '/user/home']) {
  test(`anonymous cannot replace populated acceptance ${path}`, async () => {
    const page = await contexts.get(RouteActor.Anonymous)!.newPage();
    try {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
      await expect(page.locator('sc-root')).toHaveAttribute('data-surface-id', SurfaceIdentity.Login.wire);
    } finally { await page.close(); }
  });
}
