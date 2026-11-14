import { expect, type Page, type Request, type Response } from '@playwright/test';
import type { ProductiveRouteAcceptance } from '../src/app/features/navigation/productive-route-manifest';
import type { RealRouteReceipt } from '../src/app/features/navigation/real-fixture-receipt';

const api = '/api/v1/';

/** Observe actual transport only. No interception, replay, response bodies or secrets in artifacts. */
export class RealReadTrace {
  readonly completed: { method: string; path: string; status: number }[] = [];
  readonly failures: string[] = [];
  readonly writes: string[] = [];
  private readonly pending = new Set<Request>();
  constructor(page: Page) {
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith(api)) return;
      this.pending.add(request);
      const method = request.method();
      const inspection = method === 'POST' && [api + 'customer/auth/recovery/inspect', api + 'customer/auth/email-verification/inspect'].includes(url.pathname);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !inspection) this.writes.push(`${method} ${url.pathname}`);
    });
    page.on('response', response => { void this.finish(response); });
    page.on('requestfailed', request => {
      if (!this.pending.delete(request)) return;
      this.failures.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
  }
  private async finish(response: Response): Promise<void> {
    const request = response.request();
    if (!this.pending.has(request)) return;
    const path = new URL(response.url()).pathname;
    const error = await response.finished();
    if (error) this.failures.push(`${request.method()} ${path}`);
    this.completed.push({ method: request.method(), path, status: response.status() });
    this.pending.delete(request);
  }
  async ready(paths: readonly string[]): Promise<void> {
    for (const path of paths) {
      await expect.poll(() => this.completed.some(row => row.path === api + path && row.status === 200), { message: `Real response completed: ${path}` }).toBe(true);
    }
    await expect.poll(() => this.pending.size, { message: 'All real API responses finished' }).toBe(0);
    expect(this.failures, 'Failed real API requests').toEqual([]);
    expect(this.writes, 'Read-only matrix must not mutate domain data').toEqual([]);
    const unexpected = this.completed.filter(row => row.status >= 400 && !(row.status === 401 &&
      ['customer/me', 'internal/me'].some(path => row.path === api + path)));
    expect(unexpected, 'Unexpected HTTP errors (only absent-realm probes may return 401)').toEqual([]);
  }
}

export function requiredReads(binding: ProductiveRouteAcceptance, receipt: RealRouteReceipt): readonly string[] {
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
    ['user/capabilities', ['user/capabilities']], ['user/profile-import', ['internal/me']],
  ]);
  const own = reads.get(binding.pattern);
  if (!own) throw new Error('Missing explicit real readiness binding');
  return [...new Set(['health', 'storefront/branding', 'catalog/brands', 'catalog/categories', ...own])];
}

export async function assertReflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Document must fit viewport').toBe(true);
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
