import { Page } from '@playwright/test';
import { RouteActor } from '../../src/app/features/navigation/productive-route-manifest';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const unavailable = { state: 'UNAVAILABLE', value: null, reason: 'SOURCE_MISSING' };
const unknownObservation = { state: 'UNAVAILABLE', value: null, freshness: 'UNAVAILABLE', reason: 'EXTERNAL_NOT_AVAILABLE' };

const product = {
  id: 'route-product-1', sku: 'ROUTE-SKU-1', name: 'Taladro de ruta', description: 'Producto determinista para aceptación de rutas.',
  brand: 'Route Brand', category: 'Herramientas', status: 'ACTIVE', images: [], productBasePrice: 125000,
  price: { base: 125000, original: 125000, effective: 112500, offer: { id: '7', name: 'Oferta de ruta' } },
  variants: [{
    id: 'route-variant-1', sku: 'ROUTE-SKU-1', name: 'Principal', status: 'ACTIVE', availability: 'AVAILABLE', attributes: {},
    pricePolicy: { mode: 'INHERITED', base: null },
    price: { state: 'KNOWN', price: { base: 125000, original: 125000, effective: 112500, offer: { id: '7', name: 'Oferta de ruta' } } },
    inventory: { variantId: 'route-variant-1', sku: 'ROUTE-SKU-1', state: 'KNOWN', available: 8, reserved: 1, safety: 2, onHand: 9, saleable: 6 },
  }],
};

const order = {
  id: 'ROUTE-ORDER-1', orderNumber: 'ROUTE-ORDER-1', createdAt: '2026-11-14T10:00:00Z', updatedAt: '2026-11-14T11:00:00Z',
  orderStatus: 'PAID', paymentStatus: 'APPROVED', shipmentStatus: 'PREPARING', tracking: null,
  rmaStatus: 'NONE', fulfillmentEligibility: 'ELIGIBLE', shipmentAction: 'SHIPPED', rmaAction: null,
  currency: 'ARS', subtotal: 112500, shippingCost: 0, total: 112500,
  deliveryDecision: { state: 'KNOWN', value: { mode: 'PICKUP', configurationVersion: 1, destination: null, instructions: null } },
  lines: [{ sku: 'ROUTE-SKU-1', name: 'Taladro de ruta', quantity: 1, originalUnitPrice: 125000, effectiveUnitPrice: 112500, discountAmount: 12500 }],
  buyerName: { state: 'KNOWN', value: 'Cliente Ruta', reason: null }, buyerEmail: unavailable,
  payment: { state: 'KNOWN', value: 'APPROVED', reason: null }, delivery: unavailable, timeline: { state: 'KNOWN', value: [], reason: null },
  returnEligibility: 'ELIGIBLE',
};

const customer = {
  id: 42, firstName: 'Cliente', lastName: 'Ruta', email: 'route.customer@example.test', phone: null,
  state: 'ACTIVE', createdAt: '2026-11-01T10:00:00Z', orderCount: 1, lastOrderAt: '2026-11-14T10:00:00Z',
};

const home = {
  revision: 1,
  sections: [{ key: 'route-home', kind: 'HERO', active: true, sortOrder: 0, content: { title: 'Portada de ruta', body: 'Experiencia demostrable y determinista.' }, updatedAt: null }],
};

export interface ProductiveRouteFixtureEvidence {
  readonly unhandled: string[];
  readonly writes: string[];
}

export async function installProductiveRouteFixture(page: Page, actor: RouteActor): Promise<ProductiveRouteFixtureEvidence> {
  const evidence: ProductiveRouteFixtureEvidence = { unhandled: [], writes: [] };
  await page.route('**/*', async route => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;
    const get = method === 'GET';
    const post = method === 'POST';
    const resourceType = request.resourceType();
    const localOrigin = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const localApiV1 = localOrigin && path.startsWith('/api/v1/');
    const localStaticRead = localOrigin
      && get
      && ['document', 'stylesheet', 'script', 'image', 'font'].includes(resourceType)
      && !path.startsWith('/api/');

    if (!localApiV1) {
      if (localStaticRead) return route.continue();
      if (!get) evidence.writes.push(`${method} ${url.origin}${path}`);
      evidence.unhandled.push(`${method} ${url.origin}${path}${url.search}`);
      return route.abort('blockedbyclient');
    }

    if (path.endsWith('/customer/me') && get) return actor === RouteActor.Customer
      ? route.fulfill({ json: envelope({ id: 'route-customer-1', email: 'route.customer@example.test', firstName: 'Cliente', lastName: 'Ruta', phone: '' }) })
      : route.fulfill({ status: 401, json: { code: 401 } });
    if (path.endsWith('/internal/me') && get) return actor === RouteActor.Admin
      ? route.fulfill({ json: envelope({ id: 'route-admin-1', roles: ['ADMIN'] }) })
      : route.fulfill({ status: 401, json: { code: 401 } });
    if (path.endsWith('/auth/csrf') && get) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'route-fixture-csrf' } });
    if (path.endsWith('/health') && get) return route.fulfill({ json: envelope({ status: 'UP' }) });

    if (path.endsWith('/auth/recovery/inspect') && post) {
      return route.fulfill({ json: { code: 200, data: { kind: 'INVALID' }, errorCode: null } });
    }
    if (path.endsWith('/auth/email-verification/inspect') && post) {
      return route.fulfill({ json: { code: 200, data: { kind: 'INVALID' }, errorCode: null } });
    }
    if (path.endsWith('/auth/email-verification') && get) {
      return route.fulfill({ json: { code: 200, data: { ownership: 'UNVERIFIED' }, errorCode: null } });
    }

    if (path === '/api/v1/catalog/categories' && get) return route.fulfill({ json: envelope([{ id: 'route-category-1', name: 'Herramientas' }]) });
    if (path === '/api/v1/catalog/brands' && get) return route.fulfill({ json: envelope([{ id: 'route-brand-1', name: 'Route Brand' }]) });
    if (path === '/api/v1/catalog' && get) return route.fulfill({ json: envelope({ items: [product], total: 1, page: 0, size: 50, truncated: false }) });
    if (path === '/api/v1/catalog/products/ROUTE-SKU-1' && get) return route.fulfill({ json: envelope(product) });
    if (path === '/api/v1/content/home' && get) return route.fulfill({ json: envelope(home) });

    if (path === '/api/v1/customer/cart' && get) return route.fulfill({ json: envelope({
      revision: 'a'.repeat(64), currency: 'ARS',
      deliveryOptions: [{ mode: 'PICKUP', label: 'Retiro en tienda', cost: 0, currency: 'ARS', minDays: 0, maxDays: 1, requiresAddress: false, configurationVersion: 1, destination: 'Local central', instructions: 'Presentá el número de orden.' }],
      lines: [{ sku: 'ROUTE-SKU-1', name: 'Taladro de ruta', quantity: 1, effectiveUnitPrice: 112500, originalUnitPrice: 125000, discountAmount: 12500, offerRef: '7', campaignRef: null }],
    }) });
    if (path === '/api/v1/customer/me/addresses' && get) return route.fulfill({ json: envelope([{ id: 'ROUTE-ADDRESS-1', street: 'Calle de ruta', number: '42', city: 'Córdoba', province: 'Córdoba', postalCode: '5000', isDefault: true, revision: '2026-11-14T10:00:00Z' }]) });
    if (path === '/api/v1/customer/favorites' && get) return route.fulfill({ json: envelope([{ sku: 'ROUTE-SKU-1', name: 'Taladro de ruta', price: 112500, imageUrl: null, availability: 'AVAILABLE', addedAt: '2026-11-14T10:00:00Z' }]) });
    if (path === '/api/v1/customer/orders' && get) return route.fulfill({ json: envelope({ items: [order], page: 0, size: 25, total: 1, truncated: false }) });
    if (path === '/api/v1/customer/orders/ROUTE-ORDER-1' && get) return route.fulfill({ json: envelope(order) });

    if (path === '/api/v1/user/overview' && get) return route.fulfill({ json: envelope({
      period: 'TODAY', timezone: 'America/Argentina/Buenos_Aires', fromInclusive: '2026-11-14T03:00:00Z', toExclusive: '2026-11-15T03:00:00Z',
      accreditedRevenue: { state: 'KNOWN', value: 112500, reason: null }, orderCount: { state: 'KNOWN', value: 1, reason: null },
      activeCustomerCount: { state: 'KNOWN', value: 1, reason: null }, inventoryAtRiskCount: { state: 'KNOWN', value: 1, reason: null },
      pendingPayments: { state: 'KNOWN', reason: null, totalCount: 1, truncated: false, items: [{ orderId: 1, orderNumber: 'ROUTE-ORDER-1', total: 112500, createdAt: '2026-11-14T10:00:00Z', reason: 'PENDING' }] },
      fulfillment: { state: 'KNOWN', reason: null, totalCount: 1, truncated: false, items: [{ orderId: 1, orderNumber: 'ROUTE-ORDER-1', total: 112500, paidAt: '2026-11-14T10:30:00Z', shipmentState: 'PREPARING' }] },
      lowStock: { state: 'KNOWN', reason: null, totalCount: 1, truncated: false, items: [{ variantId: 1, sku: 'ROUTE-SKU-1', productName: 'Taladro de ruta', variantLabel: 'Principal', availableQuantity: 8, safetyStock: 2 }] },
    }) });
    if (path === '/api/v1/user/content/home' && get) return route.fulfill({ json: envelope(home) });
    if (path === '/api/v1/user/catalog' && get) return route.fulfill({ json: envelope({ items: [product], total: 1, page: 0, size: 50, truncated: false }) });
    if (path === '/api/v1/user/offers' && get) return route.fulfill({ json: envelope([{ id: 7, name: 'Oferta de ruta', status: 'DRAFT', priority: 10, startsAt: '2026-11-14T10:00:00Z', endsAt: '2026-11-21T10:00:00Z', discountKind: 'PERCENT', discountValue: 10, minMarginPercent: 5, skus: ['ROUTE-SKU-1'], createdAt: '2026-11-14T09:00:00Z', approvedAt: null }]) });
    if (path === '/api/v1/user/customers' && get) return route.fulfill({ json: envelope({ items: [customer], page: 0, pageSize: 25, total: 1 }) });
    if (path === '/api/v1/user/promos' && get) return route.fulfill({ json: envelope({ items: [{ id: 'ROUTE-POLICY-1', listingSku: 'ROUTE-SKU-1', currency: 'ARS', priceScope: 'CAMPAIGN', basePrice: 125000, desiredPrice: 112500, observedPrice: unknownObservation, effectivePromoPrice: 112500, status: 'DRAFT', validFrom: '2026-11-14T10:00:00Z', validTo: '2026-11-21T10:00:00Z', writer: 'MANUAL', approvedBy: null, approvedAt: null }], total: 1, page: 0, size: 25, truncated: false }) });
    if (path === '/api/v1/user/orders' && get) return route.fulfill({ json: envelope({ items: [order], page: 0, size: 25, total: 1, truncated: false }) });
    if (path === '/api/v1/user/orders/ROUTE-ORDER-1' && get) return route.fulfill({ json: envelope(order) });
    if (path === '/api/v1/user/orders/ROUTE-ORDER-1/return-disposition' && get) return route.fulfill({ status: 404, json: { code: 404 } });
    if (path === '/api/v1/user/inventory' && get) return route.fulfill({ json: envelope({ items: [{ variantId: 'route-variant-1', sku: 'ROUTE-SKU-1', productName: 'Taladro de ruta', variantLabel: 'Principal', state: 'KNOWN', available: 8, reserved: 1, safety: 2, onHand: 9, saleable: 6 }], total: 1, page: 0, size: 50, truncated: false }) });
    if (path === '/api/v1/user/mercadolibre/account' && get) return route.fulfill({ json: envelope({ accountRef: 'ROUTE-ML-ACCOUNT', status: 'ACTIVE', availability: 'KNOWN', reason: null, updatedAt: '2026-11-14T10:00:00Z' }) });
    if (path === '/api/v1/user/mercadolibre/listings' && get) return route.fulfill({ json: envelope({ items: [{ listingId: 'ROUTE-ML-1', variationId: '', sku: 'ROUTE-SKU-1', accountRef: 'ROUTE-ML-ACCOUNT', status: 'ACTIVE', desiredQuantity: 8, desiredPrice: 112500, observedQuantity: { state: 'KNOWN', value: 8, freshness: 'UNVERIFIED', reason: null }, observedPrice: { state: 'KNOWN', value: 112500, freshness: 'UNVERIFIED', reason: null }, manualInterventionRequired: false, updatedAt: '2026-11-14T10:00:00Z' }], total: 1, page: 0, size: 25, truncated: false }) });
    if (path === '/api/v1/user/capabilities' && get) return route.fulfill({ json: envelope([{ module: 'CATALOG', state: 'ACTIVE', configVersion: 1 }, { module: 'MANUAL_FULFILLMENT', state: 'ACTIVE', configVersion: 1 }]) });

    if (!get) evidence.writes.push(`${method} ${path}`);
    evidence.unhandled.push(`${method} ${path}${url.search}`);
    return route.fulfill({ status: get ? 503 : 405, json: { code: get ? 503 : 405 } });
  });
  return evidence;
}
