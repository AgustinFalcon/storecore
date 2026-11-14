import { randomUUID } from 'node:crypto';
import { expect, type Browser, type BrowserContext, type Page, type Response, type TestInfo } from '@playwright/test';
import { AccessContext } from '../src/app/domain/access/access-context';
import { readApiBody } from '../src/app/core/api/base-response';
import { RouteActionClass, RouteActor, RouteEvidenceMode } from '../src/app/features/navigation/route-evidence';
import { origin } from './support';

/** Each case owns its responsibility and declares the route/actor/action evidence. */
export class RealActionCase {
  private constructor(readonly id: string, readonly routes: readonly string[], readonly actor: RouteActor,
    readonly kind: RouteActionClass, readonly evidence = RouteEvidenceMode.RealBackend) {}
  static readonly Registration = new RealActionCase('registration', ['/customer/register', '/login'], RouteActor.Anonymous, RouteActionClass.Mutation);
  static readonly Profile = new RealActionCase('profile', ['/customer/profile'], RouteActor.Customer, RouteActionClass.Mutation);
  static readonly Addresses = new RealActionCase('addresses-ownership', ['/customer/addresses'], RouteActor.Customer, RouteActionClass.Mutation);
  static readonly Favorites = new RealActionCase('favorites', ['/catalog/:sku', '/customer/favorites'], RouteActor.Customer, RouteActionClass.Mutation);
  static readonly Checkout = new RealActionCase('cart-checkout-order-ownership', ['/catalog/:sku', '/cart', '/checkout', '/checkout/result/:orderId', '/customer/orders', '/customer/orders/:id'], RouteActor.Customer, RouteActionClass.Mutation);
  static readonly Pending = new RealActionCase('unpaid-order-rejection', ['/user/orders', '/user/orders/:id'], RouteActor.Admin, RouteActionClass.Rejection);
  static readonly Catalog = new RealActionCase('catalog-inventory', ['/user/catalog', '/user/inventory'], RouteActor.Admin, RouteActionClass.Mutation);
  static readonly Offers = new RealActionCase('offers', ['/user/offers'], RouteActor.Admin, RouteActionClass.Mutation);
  static readonly Promos = new RealActionCase('promos', ['/user/promos'], RouteActor.Admin, RouteActionClass.Mutation);
  static readonly Branding = new RealActionCase('branding-conflict', ['/user/settings', '/'], RouteActor.Admin, RouteActionClass.Mutation);
  static readonly Content = new RealActionCase('content', ['/user/content', '/'], RouteActor.Admin, RouteActionClass.Mutation);
  static readonly Import = new RealActionCase('profile-import', ['/user/profile-import'], RouteActor.Admin, RouteActionClass.Mutation);
  static readonly Suspension = new RealActionCase('customer-revocation', ['/user/customers'], RouteActor.Admin, RouteActionClass.Mutation);
  static readonly Permissions = new RealActionCase('operator-permissions-csrf', ['/user/customers', '/user/capabilities'], RouteActor.Operator, RouteActionClass.Rejection);
  static readonly External = new RealActionCase('external-unavailable', ['/user/mercadolibre', '/user/capabilities'], RouteActor.Admin, RouteActionClass.Read);
  static readonly Capability = new RealActionCase('local-capability-command', ['/user/capabilities'], RouteActor.Admin, RouteActionClass.Mutation);
  static readonly Unknown = new RealActionCase('unknown', [], RouteActor.Unknown, RouteActionClass.Unknown, RouteEvidenceMode.Unknown);
  static readonly all = [this.Registration, this.Profile, this.Addresses, this.Favorites, this.Checkout, this.Pending,
    this.Catalog, this.Offers, this.Promos, this.Branding, this.Content, this.Import, this.Suspension,
    this.Permissions, this.External, this.Capability] as const;
  static fromWire(raw: unknown): RealActionCase { return this.all.find(row => row.id === raw) ?? this.Unknown; }
  annotate(info: TestInfo): void {
    expect(this).not.toBe(RealActionCase.Unknown);
    info.annotations.push({ type: 'evidence', description: this.evidence.wire },
      { type: 'action', description: JSON.stringify({ id: this.id, routes: this.routes, actor: this.actor.wire, kind: this.kind.wire }) });
  }
}

export enum WriteMethod { Post = 'POST', Put = 'PUT', Delete = 'DELETE' }

export async function body<T = Record<string, unknown>>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1/${path}`);
  expect(response.status(), `Real readback: ${path}`).toBe(200);
  return readApiBody<T>(await response.json());
}

export async function mutate(page: Page, realm: AccessContext, path: string, data: unknown, method = WriteMethod.Post) {
  const csrf = await page.request.get(`/api/v1/${realm === AccessContext.User ? 'internal' : 'customer'}/auth/csrf`);
  expect(csrf.status()).toBe(200);
  expect(csrf.headers()['x-csrf-token']).toBeTruthy();
  return page.request.fetch(`/api/v1/${path}`, { method, headers: { Origin: origin,
    'X-CSRF-Token': csrf.headers()['x-csrf-token']! }, data });
}

export function mutation(page: Page, path: string, method = WriteMethod.Post): Promise<Response> {
  return page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/${path}` && response.request().method() === method);
}

/** Disposable customer per journey: no shared receipt data or storage-state artifacts. */
export class JourneyCustomer {
  private constructor(readonly context: BrowserContext, readonly page: Page, readonly email: string) {}
  static async create(browser: Browser): Promise<JourneyCustomer> {
    const context = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const email = `prm-${randomUUID()}@storecore.invalid`;
    const password = `PRM-${randomUUID()}!aA1`;
    const customer = new JourneyCustomer(context, page, email);
    try {
      const response = await page.request.post('/api/v1/customer/auth/register', { headers: { Origin: origin },
        data: { email, password, firstName: 'PRM', lastName: 'Journey' } });
      expect(response.status()).toBe(201);
      await customer.assertRealm();
      return customer;
    } catch (error) { await context.close(); throw error; }
  }
  async assertRealm(): Promise<void> {
    expect((await body<{ email: string }>(this.page, 'customer/me')).email).toBe(this.email);
    expect((await this.page.request.get('/api/v1/internal/me')).status()).toBe(401);
    const cookies = await this.context.cookies();
    expect(cookies.find(cookie => cookie.name === '__Host-storecore-customer'))
      .toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookies.some(cookie => cookie.name === '__Host-storecore-internal')).toBe(false);
  }
  async close(): Promise<void> { await this.context.close(); }
}
