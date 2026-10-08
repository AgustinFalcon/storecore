import type { Page } from '@playwright/test';
import { FAVORITES_STORAGE_KEY } from '../src/app/core/favorites/session-favorites';
import { ScreenRealm } from './route-manifest';

const fixtureOrigin = 'http://127.0.0.1:4300';
export class OfflineFontResource {
  static readonly Stylesheet = new OfflineFontResource('stylesheet', true);
  static readonly Xhr = new OfflineFontResource('xhr', true);
  static readonly Unknown = new OfflineFontResource('unknown', false);

  private constructor(readonly wire: string, readonly canAbortOffline: boolean) {}

  static fromWire(value: unknown): OfflineFontResource {
    return [this.Stylesheet, this.Xhr].find((type) => type.wire === value) ?? this.Unknown;
  }
}

const line = { sku: 'TEST-SKU', name: 'Producto de prueba', quantity: 1, originalUnitPrice: 100,
  discountAmount: 0, offerRef: null, campaignRef: null, effectiveUnitPrice: 100 };
const product = { sku: line.sku, name: line.name, description: 'Descripción de prueba', brand: 'Marca de prueba',
  category: 'Categoría de prueba', images: [], variants: [{ id: 'test-variant', sku: line.sku, name: 'Única', availableQuantity: 5 }],
  price: { base: 100, desired: null, observed: null, effective: 100, priceVersion: '1' }, active: true };
const order = { id: 'test-order', orderStatus: 'PAID', paymentStatus: 'APPROVED', shipmentStatus: 'PREPARING',
  rmaStatus: null, tracking: null, total: 100, lines: [line] };
const profile = { id: 'test-customer', email: 'customer@example.invalid', firstName: 'Cliente', lastName: 'Prueba', phone: '' };
const address = { id: 'test-address', street: 'Calle de prueba', number: '1', city: 'Ciudad', province: 'Provincia', postalCode: '1000', isDefault: true };
const home = { title: 'Home de prueba', body: 'Contenido de prueba', blocks: [{ id: 'test-block', title: 'Bloque de prueba', body: 'Texto de prueba' }] };
const publicReads: Readonly<Record<string, unknown>> = {
  '/api/v1/health': { status: 'UP', installation: 'test' },
  '/api/v1/catalog': [product], '/api/v1/catalog/products/TEST-SKU': product,
  '/api/v1/catalog/brands': [{ id: 'test-brand', name: 'Marca de prueba' }],
  '/api/v1/catalog/categories': [{ id: 'test-category', name: 'Categoría de prueba' }],
  '/api/v1/content/home': home,
};
const customerReads: Readonly<Record<string, unknown>> = {
  '/api/v1/customer/me': profile, '/api/v1/customer/auth/csrf': {},
  '/api/v1/customer/me/addresses': [address], '/api/v1/customer/cart': { currency: 'ARS', lines: [line] },
  '/api/v1/customer/orders': [order], '/api/v1/customer/orders/test-order': order,
};
const userReads: Readonly<Record<string, unknown>> = {
  '/api/v1/internal/me': { id: 'test-operator', roles: ['ADMIN'] }, '/api/v1/internal/auth/csrf': {},
  '/api/v1/user/content/home': home, '/api/v1/user/catalog': [product],
  '/api/v1/user/catalog/brands': publicReads['/api/v1/catalog/brands'],
  '/api/v1/user/catalog/categories': publicReads['/api/v1/catalog/categories'],
  '/api/v1/user/offers': [{ id: 'test-offer', name: 'Oferta de prueba', status: 'DRAFT', priority: 1,
    startsAt: '2026-01-01T00:00:00Z', endsAt: '2027-01-01T00:00:00Z', discountType: 'PERCENT', discountValue: '10', minMarginPercent: '0', skus: [line.sku] }],
  '/api/v1/user/promos': [{ id: 'test-promo', listingSku: line.sku, currency: 'ARS', validFrom: '2026-01-01T00:00:00Z',
    validTo: '2027-01-01T00:00:00Z', priority: 1, margin: 10, approvedBy: 'test-operator', approvedAt: '2026-01-01T00:00:00Z', writer: 'MANUAL' }],
  '/api/v1/user/orders': [order], '/api/v1/user/orders/test-order': order,
  '/api/v1/user/inventory': [{ sku: line.sku, availableQuantity: 5, reservedQuantity: 1, safetyStock: 1 }],
  '/api/v1/user/mercadolibre/account': { authorized: false, accountRef: 'test-account', status: 'DISABLED' },
  '/api/v1/user/mercadolibre/listings': [{ listingId: 'test-listing', variationId: '', sku: line.sku, accountId: 1 }],
  '/api/v1/user/capabilities': [{ module: 'MARKETPLACE_ML', state: 'DISABLED' }],
};

/** Test-only HTTP boundary: no fixture or auth override is registered in the application. */
export async function installApiFixtures(page: Page, realm: ScreenRealm): Promise<{ unexpected: string[]; seen: Set<string> }> {
  const unexpected: string[] = [];
  const seen = new Set<string>();
  const reads = { ...publicReads, ...(realm === ScreenRealm.Customer || realm === ScreenRealm.Dual ? customerReads : {}),
    ...(realm === ScreenRealm.User || realm === ScreenRealm.Dual ? userReads : {}) };
  await page.addInitScript(({ key, item }) => sessionStorage.setItem(key, JSON.stringify([item])),
    { key: FAVORITES_STORAGE_KEY, item: { sku: line.sku, name: line.name } });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const resource = OfflineFontResource.fromWire(request.resourceType());
    // axe's CSS inspection uses XHR; both known resource types remain strictly offline.
    if (request.method() === 'GET' && resource.canAbortOffline &&
      url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2' &&
      !url.username && !url.password && !url.hash && url.searchParams.size === 2 &&
      url.searchParams.getAll('family').length === 1 && url.searchParams.getAll('display').length === 1 &&
      url.searchParams.get('family') === 'Inter:wght@400;500;600;650;700' && url.searchParams.get('display') === 'swap') {
      await route.abort('blockedbyclient');
      return;
    }
    if (url.origin !== fixtureOrigin || url.pathname.startsWith('/api')) {
      const diagnosticUrl = new URL(url.href);
      diagnosticUrl.username = '';
      diagnosticUrl.password = '';
      unexpected.push(JSON.stringify({ kind: 'Unmatched request', method: request.method(),
        resourceType: request.resourceType(), url: diagnosticUrl.href }));
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    // This last-registered handler runs before the catch-all: enforce origin here too.
    if (url.origin !== fixtureOrigin) {
      unexpected.push('External API request ' + url.origin + path);
      await route.abort('blockedbyclient');
      return;
    }
    seen.add(path);
    if (request.method() === 'GET' && (path === '/api/v1/customer/me' || path === '/api/v1/internal/me') && !(path in reads)) {
      await route.fulfill({ status: 401, json: { code: 401, data: null, errorCode: 'UNAUTHORIZED' } });
      return;
    }
    if (request.method() !== 'GET' || !(path in reads)) {
      unexpected.push(request.method() + ' ' + path);
      await route.abort('blockedbyclient');
      return;
    }
    await route.fulfill({ status: 200, headers: path.endsWith('/csrf') ? { 'X-CSRF-Token': 'test-csrf' } : {},
      json: { code: 200, data: reads[path], message: null, errorCode: null, retryable: null, traceId: null } });
  });
  return { unexpected, seen };
}
