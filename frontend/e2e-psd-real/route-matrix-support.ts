import { expect, type Page, type Request, type Response } from '@playwright/test';
import { createHash } from 'node:crypto';
import type { ProductiveRouteAcceptance } from '../src/app/features/navigation/productive-route-manifest';
import type { RealRouteReceipt } from '../src/app/features/navigation/real-fixture-receipt';
import { ApiErrorCode } from '../src/app/core/api/api-error-code';
import evidenceWire from '../route-evidence-wire.json';

const api = '/api/v1/';

export class RealReadExpectation {
  private constructor(readonly wire: string, readonly status: number, readonly errorCode: ApiErrorCode | null) {}
  static readonly Data = new RealReadExpectation('DATA', 200, null);
  static readonly CapabilityDisabled = new RealReadExpectation('CAPABILITY_DISABLED', 409, ApiErrorCode.CapabilityDisabled);
  static readonly Unknown = new RealReadExpectation('UNKNOWN', 0, ApiErrorCode.Unknown);
  static fromWire(raw: unknown): RealReadExpectation {
    return [this.Data, this.CapabilityDisabled].find(value => value.wire === raw) ?? this.Unknown;
  }
  accepts(row: FinishedObservedRequest): boolean {
    return this !== RealReadExpectation.Unknown && row.status === this.status &&
      (this.errorCode === null || row.errorCode === this.errorCode);
  }
}

export class RealReadRequirement {
  private constructor(readonly path: string, readonly expectation: RealReadExpectation) {}
  static data(path: string): RealReadRequirement { return new RealReadRequirement(path, RealReadExpectation.Data); }
  static disabled(path: string): RealReadRequirement {
    if (!['user/mercadolibre/account', 'user/mercadolibre/listings'].includes(path)) throw new Error('Unexpected disabled real read');
    return new RealReadRequirement(path, RealReadExpectation.CapabilityDisabled);
  }
}

export class RealReadTerminal {
  private constructor(readonly wire: string) {}
  static readonly Pending = new RealReadTerminal(evidenceWire.readTerminal.pending);
  static readonly Finished = new RealReadTerminal(evidenceWire.readTerminal.finished);
  static readonly Failed = new RealReadTerminal(evidenceWire.readTerminal.failed);
  static readonly Unknown = new RealReadTerminal(evidenceWire.readTerminal.unknown);
  static fromWire(raw: unknown): RealReadTerminal {
    return [this.Pending, this.Finished, this.Failed].find(value => value.wire === raw) ?? this.Unknown;
  }
}

export class RealReadFailure {
  private constructor(readonly wire: string) {}
  static readonly Aborted = new RealReadFailure(evidenceWire.readFailure.aborted);
  static readonly Connection = new RealReadFailure(evidenceWire.readFailure.connection);
  static readonly Unknown = new RealReadFailure(evidenceWire.readFailure.unknown);
  static fromTransport(raw: unknown): RealReadFailure {
    if (typeof raw !== 'string') return this.Unknown;
    if (raw.includes('ERR_ABORTED') || raw.includes('NS_BINDING_ABORTED') || raw.toLowerCase().includes('cancel')) return this.Aborted;
    if (raw.includes('ERR_CONNECTION') || raw.includes('ERR_NETWORK') || raw.includes('ERR_NAME_NOT_RESOLVED') ||
      raw.includes('ERR_INTERNET_DISCONNECTED') || raw.includes('ERR_TIMED_OUT')) return this.Connection;
    return this.Unknown;
  }
}

export class AccessibilityImpact {
  private constructor(readonly wire: string, readonly blocking: boolean) {}
  static readonly Minor = new AccessibilityImpact(evidenceWire.axeImpact.minor, false);
  static readonly Moderate = new AccessibilityImpact(evidenceWire.axeImpact.moderate, false);
  static readonly Serious = new AccessibilityImpact(evidenceWire.axeImpact.serious, true);
  static readonly Critical = new AccessibilityImpact(evidenceWire.axeImpact.critical, true);
  static readonly Unknown = new AccessibilityImpact(evidenceWire.axeImpact.unknown, true);
  static fromWire(raw: unknown): AccessibilityImpact {
    return [this.Minor, this.Moderate, this.Serious, this.Critical].find(value => value.wire === raw) ?? this.Unknown;
  }
}

export interface SafeReflowDiagnostic {
  readonly viewportWidth: number;
  readonly documentWidth: number;
  readonly overflow: boolean;
  readonly nodes: readonly { tag: string; path: string; left: number; right: number; width: number }[];
}

interface ObservedRequest {
  readonly identity: string;
  readonly sequence: number;
  readonly method: string;
  readonly path: string;
}

interface FinishedObservedRequest extends ObservedRequest {
  readonly status: number;
  readonly errorCode: ApiErrorCode;
}

/** Observe actual transport only. No interception, replay, response bodies or secrets in artifacts. */
export class RealReadTrace {
  readonly completed: { method: string; path: string; status: number }[] = [];
  readonly failures: ObservedRequest[] = [];
  readonly writes: string[] = [];
  private readonly pending = new Set<Request>();
  private readonly observations = new WeakMap<Request, ObservedRequest>();
  private readonly responseStatuses = new WeakMap<Request, number>();
  private readonly responses = new WeakMap<Request, Response>();
  private readonly finished: FinishedObservedRequest[] = [];
  private readonly interruptedHttpErrors: { method: string; path: string; status: number }[] = [];
  private readonly diagnostics = new Map<Request, { method: string; path: string; status: number | null;
    terminal: RealReadTerminal; failure: RealReadFailure | null }>();
  private sequence = 0;
  constructor(page: Page) {
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith(api)) return;
      this.pending.add(request);
      const method = request.method();
      this.diagnostics.set(request, { method, path: url.pathname, status: null, terminal: RealReadTerminal.Pending, failure: null });
      const bodyDigest = createHash('sha256').update(request.postData() ?? '').digest('hex');
      this.observations.set(request, { identity: `${method} ${url.pathname}${url.search} ${bodyDigest}`,
        sequence: ++this.sequence, method, path: url.pathname });
      const inspection = method === 'POST' && [api + 'customer/auth/recovery/inspect', api + 'customer/auth/email-verification/inspect'].includes(url.pathname);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !inspection) this.writes.push(`${method} ${url.pathname}`);
    });
    page.on('requestfinished', request => { void this.finish(request); });
    page.on('response', response => this.observeResponse(response));
    page.on('requestfailed', request => {
      if (!this.pending.delete(request)) return;
      const diagnostic = this.diagnostics.get(request);
      if (diagnostic) {
        diagnostic.terminal = RealReadTerminal.Failed;
        diagnostic.failure = RealReadFailure.fromTransport(request.failure()?.errorText);
      }
      const observation = this.observations.get(request);
      if (observation) {
        this.failures.push(observation);
        const status = this.responseStatuses.get(request);
        if (status !== undefined && status >= 400) this.interruptedHttpErrors.push({
          method: observation.method, path: observation.path, status,
        });
      }
    });
  }
  private observeResponse(response: Response): void {
    const request = response.request();
    if (!this.pending.has(request)) return;
    const observation = this.observations.get(request);
    if (!observation) return;
    const status = response.status();
    this.responses.set(request, response);
    this.responseStatuses.set(request, status);
    const diagnostic = this.diagnostics.get(request);
    if (diagnostic) diagnostic.status = status;
    this.completed.push({ method: observation.method, path: observation.path, status });
  }
  private async finish(request: Request): Promise<void> {
    if (!this.pending.has(request)) return;
    const observation = this.observations.get(request);
    if (!observation) return;
    const status = this.responseStatuses.get(request);
    const diagnostic = this.diagnostics.get(request);
    if (diagnostic) diagnostic.terminal = RealReadTerminal.Finished;
    if (status === undefined) {
      this.failures.push(observation);
      this.pending.delete(request);
      return;
    }
    let errorCode = ApiErrorCode.Unknown;
    if (status === RealReadExpectation.CapabilityDisabled.status) {
      try {
        const raw: unknown = await this.responses.get(request)?.json();
        if (raw && typeof raw === 'object') errorCode = ApiErrorCode.fromWire((raw as Record<string, unknown>)['errorCode']);
      } catch { /* An unreadable error cannot satisfy the typed denial contract. */ }
    }
    this.finished.push({ ...observation, status, errorCode });
    this.pending.delete(request);
  }
  snapshot(finalUrl: string): { finalPath: string; requests: { method: string; path: string; status: number | null;
    terminal: string; failure: string | null }[] } {
    return { finalPath: new URL(finalUrl).pathname, requests: [...this.diagnostics.values()].map(row =>
      ({ method: row.method, path: row.path, status: row.status, terminal: row.terminal.wire, failure: row.failure?.wire ?? null })) };
  }
  async ready(reads: readonly (string | RealReadRequirement)[]): Promise<void> {
    const requirements = reads.map(read => typeof read === 'string' ? RealReadRequirement.data(read) : read);
    const paths = requirements.map(read => read.path);
    const [health, branding, ...owned] = paths;
    expect(health).toBe('health');
    expect(branding).toBe('storefront/branding');
    await expect.poll(() => this.finished.some(row => row.path === api + health && RealReadExpectation.Data.accepts(row)), { message: 'Real health response completed' }).toBe(true);
    await expect.poll(() => this.finished.some(row => row.path === api + branding && RealReadExpectation.Data.accepts(row)), { message: 'Real branding response completed' }).toBe(true);
    for (const path of owned) {
      const requirement = requirements.find(read => read.path === path)!;
      await expect.poll(() => this.finished.some(row => row.path === api + path && requirement.expectation.accepts(row)), { message: 'Real route-owned response completed' }).toBe(true);
    }
    await expect.poll(() => this.pending.size, { message: 'All real API responses finished' }).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 100));
    await expect.poll(() => this.pending.size, { message: 'Real API response set remains stable' }).toBe(0);
    const requiredPaths = new Set(paths.map(path => api + path));
    const unresolvedFailures = this.failures.filter(failure => requiredPaths.has(failure.path)
      && !this.finished.some(success => success.identity === failure.identity && success.sequence > failure.sequence &&
        requirements.some(read => api + read.path === success.path && read.expectation.accepts(success))));
    expect(unresolvedFailures.map(failure => `${failure.method} ${failure.path}`),
      'Failed real API requests without a later identical successful replacement').toEqual([]);
    expect(this.writes, 'Read-only matrix must not mutate domain data').toEqual([]);
    const wrongDenials = this.finished.filter(row => requirements.some(read => read.expectation === RealReadExpectation.CapabilityDisabled &&
      api + read.path === row.path && row.status === read.expectation.status && !read.expectation.accepts(row)));
    expect(wrongDenials.map(row => `${row.method} ${row.path}`), 'Only the typed capability denial is expected').toEqual([]);
    expect(this.interruptedHttpErrors, 'Interrupted HTTP errors remain errors even when a later request succeeds').toEqual([]);
    const unexpected = this.completed.filter(row => row.status >= 400 && !(row.status === 401 &&
      ['customer/me', 'internal/me'].some(path => row.path === api + path)) &&
      !requirements.some(read => read.expectation === RealReadExpectation.CapabilityDisabled && api + read.path === row.path && row.status === read.expectation.status));
    expect(unexpected, 'Unexpected HTTP errors (only absent-realm probes may return 401)').toEqual([]);
  }
}

export function requiredReads(binding: ProductiveRouteAcceptance, receipt: RealRouteReceipt): readonly RealReadRequirement[] {
  const product = receipt.products[0];
  const order = receipt.pendingOrderId;
  const reads = new Map<string, readonly string[]>([
    ['', ['content/home']], ['login', []], ['recover', []],
    ['reset-password', ['customer/auth/recovery/inspect']],
    ['verify-email', ['customer/auth/email-verification/inspect']],
    ['catalog', ['catalog']], ['catalog/:sku', [`catalog/products/${encodeURIComponent(product.sku)}`]],
    ['cart', ['customer/cart']], ['checkout', ['customer/cart', 'customer/me/addresses']],
    ['checkout/result/:orderId', [`customer/orders/${order}`]], ['customer/register', []],
    ['customer/profile', ['customer/me', 'customer/auth/email-verification']],
    ['customer/addresses', ['customer/me/addresses']], ['customer/favorites', ['customer/favorites']],
    ['customer/orders', ['customer/orders']], ['customer/orders/:id', [`customer/orders/${order}`]],
    ['user/account', ['internal/me', 'internal/auth/email-verification']], ['user/home', ['user/overview']],
    ['user/settings', ['user/settings/branding']], ['user/content', ['user/content/home']],
    ['user/catalog', ['user/catalog']], ['user/offers', ['user/offers']], ['user/customers', ['user/customers']],
    ['user/promos', ['user/promos']], ['user/orders', ['user/orders']], ['user/orders/:id', [`user/orders/${order}`]],
    ['user/inventory', ['user/inventory']], ['user/mercadolibre', ['user/mercadolibre/account', 'user/mercadolibre/listings']],
    ['user/capabilities', ['user/capabilities']], ['user/profile-import', []],
    ['user/notifications', ['user/notifications', 'user/notifications/email-preferences']],
    ['user/notifications/:alertId', [`user/notifications/${receipt.notification?.id.wire}`]],
  ]);
  const own = reads.get(binding.pattern);
  if (!own) throw new Error('Missing explicit real readiness binding');
  const storefrontFacets = ['', 'catalog', 'catalog/:sku'].includes(binding.pattern)
    ? ['catalog/brands', 'catalog/categories'] : [];
  return [...new Set(['health', 'storefront/branding', ...storefrontFacets, ...own])].map(path =>
    binding.pattern === 'user/mercadolibre' && own.includes(path) ? RealReadRequirement.disabled(path) : RealReadRequirement.data(path));
}

export async function measureReflow(page: Page): Promise<SafeReflowDiagnostic> {
  return page.evaluate(() => {
    const structuralPath = (target: Element): string => {
      const segments: string[] = [];
      let element: Element | null = target;
      while (element) {
        const tag = element.tagName.toLowerCase();
        const siblings = element.parentElement ? [...element.parentElement.children].filter(row => row.tagName === element!.tagName) : [element];
        segments.unshift(`${tag}:${siblings.indexOf(element) + 1}`);
        element = element.parentElement;
      }
      return segments.join('/');
    };
    const nodes = [...document.body.querySelectorAll('*')].flatMap(element => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.left >= -1 && rect.right <= innerWidth + 1) return [];
      return [{ tag: element.tagName.toLowerCase(), path: structuralPath(element), left: Math.round(rect.left),
        right: Math.round(rect.right), width: Math.round(rect.width) }];
    }).slice(0, 12);
    return { viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1, nodes };
  });
}

export async function assertReflow(page: Page, diagnostic?: SafeReflowDiagnostic): Promise<void> {
  const measured = diagnostic ?? await measureReflow(page);
  expect(measured.overflow, 'Document must fit viewport').toBe(false);
  const inaccessibleTables = await page.locator('table:visible').evaluateAll(tables => tables.flatMap(table => {
    if (table.getBoundingClientRect().width <= innerWidth) return [];
    let element: HTMLElement | null = table.parentElement;
    while (element) {
      const style = getComputedStyle(element);
      const scrollable = ['auto', 'scroll'].includes(style.overflowX) && element.scrollWidth > element.clientWidth;
      if (scrollable && element.tabIndex >= 0 && element.getAttribute('role') === 'region' &&
        (element.getAttribute('aria-label') || element.getAttribute('aria-labelledby'))) return [];
      element = element.parentElement;
    }
    return [table.querySelector('caption')?.textContent?.trim() ?? 'Unlabelled table'];
  }));
  expect(inaccessibleTables, 'Overflowing tables need a named, keyboard accessible scroll region').toEqual([]);
}
