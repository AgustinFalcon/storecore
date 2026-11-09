import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const CONSTRUCTION_TOKEN = Symbol('ShowcaseStage');

export class ShowcaseStage {
  static Preflight = new ShowcaseStage(CONSTRUCTION_TOKEN, 'PREFLIGHT', 'Preflight');
  static AdminAuthentication = new ShowcaseStage(CONSTRUCTION_TOKEN, 'ADMIN_AUTHENTICATION', 'Admin authentication');
  static ExternalSafety = new ShowcaseStage(CONSTRUCTION_TOKEN, 'EXTERNAL_SAFETY', 'External integration safety');
  static CapabilityActivation = new ShowcaseStage(CONSTRUCTION_TOKEN, 'CAPABILITY_ACTIVATION', 'Capability activation');
  static CommercialContent = new ShowcaseStage(CONSTRUCTION_TOKEN, 'COMMERCIAL_CONTENT', 'Commercial content');
  static CustomerIdentity = new ShowcaseStage(CONSTRUCTION_TOKEN, 'CUSTOMER_IDENTITY', 'Customer identity');
  static CustomerAddress = new ShowcaseStage(CONSTRUCTION_TOKEN, 'CUSTOMER_ADDRESS', 'Customer address');
  static PendingOrder = new ShowcaseStage(CONSTRUCTION_TOKEN, 'PENDING_ORDER', 'Pending order');
  static Cart = new ShowcaseStage(CONSTRUCTION_TOKEN, 'CART', 'Cart');
  static Favorites = new ShowcaseStage(CONSTRUCTION_TOKEN, 'FAVORITES', 'Favorites');
  static Offers = new ShowcaseStage(CONSTRUCTION_TOKEN, 'OFFERS', 'Local offers');
  static CustomerAdministration = new ShowcaseStage(CONSTRUCTION_TOKEN, 'CUSTOMER_ADMINISTRATION', 'Customer administration');
  static Overview = new ShowcaseStage(CONSTRUCTION_TOKEN, 'OVERVIEW', 'Operator overview');
  static Verification = new ShowcaseStage(CONSTRUCTION_TOKEN, 'VERIFICATION', 'Verification');
  static Unknown = new ShowcaseStage(CONSTRUCTION_TOKEN, 'UNKNOWN', 'Unknown');
  static values = Object.freeze([
    ShowcaseStage.Preflight, ShowcaseStage.AdminAuthentication, ShowcaseStage.ExternalSafety,
    ShowcaseStage.CapabilityActivation, ShowcaseStage.CommercialContent,
    ShowcaseStage.CustomerIdentity, ShowcaseStage.CustomerAddress, ShowcaseStage.PendingOrder,
    ShowcaseStage.Cart, ShowcaseStage.Favorites, ShowcaseStage.Offers,
    ShowcaseStage.CustomerAdministration, ShowcaseStage.Overview, ShowcaseStage.Verification,
  ]);

  constructor(token, wire, label) {
    if (token !== CONSTRUCTION_TOKEN) throw new TypeError('ShowcaseStage is closed');
    this.wire = wire;
    this.label = label;
    Object.freeze(this);
  }

  static fromWire(value) {
    return ShowcaseStage.values.find((stage) => stage.wire === value) ?? ShowcaseStage.Unknown;
  }
}

const CAPABILITY_CONSTRUCTION_TOKEN = Symbol('ShowcaseCapability');

export class ShowcaseCapability {
  static Storefront = new ShowcaseCapability(CAPABILITY_CONSTRUCTION_TOKEN, 'STOREFRONT');
  static Catalog = new ShowcaseCapability(CAPABILITY_CONSTRUCTION_TOKEN, 'CATALOG');
  static ProfileContent = new ShowcaseCapability(CAPABILITY_CONSTRUCTION_TOKEN, 'PROFILE_CONTENT');
  static PaymentsMp = new ShowcaseCapability(CAPABILITY_CONSTRUCTION_TOKEN, 'PAYMENTS_MP');
  static ManualFulfillment = new ShowcaseCapability(CAPABILITY_CONSTRUCTION_TOKEN, 'MANUAL_FULFILLMENT');
  static Favorites = new ShowcaseCapability(CAPABILITY_CONSTRUCTION_TOKEN, 'FAVORITES');
  static ManualPromotions = new ShowcaseCapability(CAPABILITY_CONSTRUCTION_TOKEN, 'MANUAL_PROMOTIONS');
  static Unknown = new ShowcaseCapability(CAPABILITY_CONSTRUCTION_TOKEN, 'unknown');
  static values = Object.freeze([
    ShowcaseCapability.Storefront, ShowcaseCapability.Catalog, ShowcaseCapability.ProfileContent,
    ShowcaseCapability.PaymentsMp, ShowcaseCapability.ManualFulfillment,
    ShowcaseCapability.Favorites, ShowcaseCapability.ManualPromotions,
  ]);

  constructor(token, wire) {
    if (token !== CAPABILITY_CONSTRUCTION_TOKEN) throw new TypeError('ShowcaseCapability is closed');
    this.wire = wire;
    Object.freeze(this);
  }

  static fromWire(value) {
    return ShowcaseCapability.values.find((capability) => capability.wire === value) ?? ShowcaseCapability.Unknown;
  }
}

const CAPABILITY_STATE_CONSTRUCTION_TOKEN = Symbol('ShowcaseCapabilityState');

export class ShowcaseCapabilityState {
  static Disabled = new ShowcaseCapabilityState(CAPABILITY_STATE_CONSTRUCTION_TOKEN, 'DISABLED');
  static Active = new ShowcaseCapabilityState(CAPABILITY_STATE_CONSTRUCTION_TOKEN, 'ACTIVE');
  static Unknown = new ShowcaseCapabilityState(CAPABILITY_STATE_CONSTRUCTION_TOKEN, 'unknown');
  static values = Object.freeze([ShowcaseCapabilityState.Disabled, ShowcaseCapabilityState.Active]);

  constructor(token, wire) {
    if (token !== CAPABILITY_STATE_CONSTRUCTION_TOKEN) throw new TypeError('ShowcaseCapabilityState is closed');
    this.wire = wire;
    Object.freeze(this);
  }

  static fromWire(value) {
    return ShowcaseCapabilityState.values.find((state) => state.wire === value) ?? ShowcaseCapabilityState.Unknown;
  }
}

const ROLE_CONSTRUCTION_TOKEN = Symbol('ShowcaseRole');

export class ShowcaseRole {
  static Admin = new ShowcaseRole(ROLE_CONSTRUCTION_TOKEN, 'ADMIN');
  static Unknown = new ShowcaseRole(ROLE_CONSTRUCTION_TOKEN, 'unknown');
  static values = Object.freeze([ShowcaseRole.Admin]);

  constructor(token, wire) {
    if (token !== ROLE_CONSTRUCTION_TOKEN) throw new TypeError('ShowcaseRole is closed');
    this.wire = wire;
    Object.freeze(this);
  }

  static fromWire(value) {
    return ShowcaseRole.values.find((role) => role.wire === value) ?? ShowcaseRole.Unknown;
  }
}

const ADAPTER_MODE_CONSTRUCTION_TOKEN = Symbol('ShowcaseAdapterMode');

export class ShowcaseAdapterMode {
  static Unconfigured = new ShowcaseAdapterMode(ADAPTER_MODE_CONSTRUCTION_TOKEN, 'unconfigured');
  static Unknown = new ShowcaseAdapterMode(ADAPTER_MODE_CONSTRUCTION_TOKEN, 'unknown');
  static values = Object.freeze([ShowcaseAdapterMode.Unconfigured]);

  constructor(token, wire) {
    if (token !== ADAPTER_MODE_CONSTRUCTION_TOKEN) throw new TypeError('ShowcaseAdapterMode is closed');
    this.wire = wire;
    Object.freeze(this);
  }

  static fromWire(value) {
    return ShowcaseAdapterMode.values.find((mode) => mode.wire === value) ?? ShowcaseAdapterMode.Unknown;
  }
}

const PAYMENT_STATUS_CONSTRUCTION_TOKEN = Symbol('ShowcasePaymentStatus');

export class ShowcasePaymentStatus {
  static Pending = new ShowcasePaymentStatus(PAYMENT_STATUS_CONSTRUCTION_TOKEN, 'PENDING');
  static Unknown = new ShowcasePaymentStatus(PAYMENT_STATUS_CONSTRUCTION_TOKEN, 'unknown');
  static values = Object.freeze([ShowcasePaymentStatus.Pending]);

  constructor(token, wire) {
    if (token !== PAYMENT_STATUS_CONSTRUCTION_TOKEN) throw new TypeError('ShowcasePaymentStatus is closed');
    this.wire = wire;
    Object.freeze(this);
  }

  static fromWire(value) {
    return ShowcasePaymentStatus.values.find((status) => status.wire === value) ?? ShowcasePaymentStatus.Unknown;
  }
}

const ORDER_STATUS_CONSTRUCTION_TOKEN = Symbol('ShowcaseOrderStatus');

export class ShowcaseOrderStatus {
  static PendingPayment = new ShowcaseOrderStatus(ORDER_STATUS_CONSTRUCTION_TOKEN, 'PENDING_PAYMENT');
  static Unknown = new ShowcaseOrderStatus(ORDER_STATUS_CONSTRUCTION_TOKEN, 'unknown');
  static values = Object.freeze([ShowcaseOrderStatus.PendingPayment]);

  constructor(token, wire) {
    if (token !== ORDER_STATUS_CONSTRUCTION_TOKEN) throw new TypeError('ShowcaseOrderStatus is closed');
    this.wire = wire;
    Object.freeze(this);
  }

  static fromWire(value) {
    return ShowcaseOrderStatus.values.find((status) => status.wire === value) ?? ShowcaseOrderStatus.Unknown;
  }
}

// Each returned class owns its finite cases and its sole wire translator.
// The closure token prevents callers from extending a set at runtime.
function closedWireType(name, cases) {
  const token = Symbol(name);
  class ClosedValue {
    constructor(key, wire) {
      if (key !== token) throw new TypeError(`${name} is closed`);
      this.wire = wire;
      Object.freeze(this);
    }
    static fromWire(raw) { return this.values.find((value) => value.wire === raw) ?? this.Unknown; }
  }
  for (const [key, wire] of Object.entries(cases)) ClosedValue[key] = new ClosedValue(token, wire);
  ClosedValue.Unknown = new ClosedValue(token, 'unknown');
  ClosedValue.values = Object.freeze(Object.keys(cases).map((key) => ClosedValue[key]));
  return Object.freeze(ClosedValue);
}

export const ShowcaseOfferStatus = closedWireType('ShowcaseOfferStatus', { Draft: 'DRAFT', Active: 'ACTIVE', Paused: 'PAUSED', Ended: 'ENDED' });
export const ShowcaseDiscountKind = closedWireType('ShowcaseDiscountKind', { Percent: 'PERCENT', Fixed: 'FIXED' });
export const ShowcaseFavoriteOutcome = closedWireType('ShowcaseFavoriteOutcome', { Added: 'ADDED', AlreadyPresent: 'ALREADY_PRESENT' });
export const ShowcaseFavoriteAvailability = closedWireType('ShowcaseFavoriteAvailability', { Available: 'AVAILABLE', Unavailable: 'UNAVAILABLE' });
export const ShowcaseCustomerState = closedWireType('ShowcaseCustomerState', { Active: 'ACTIVE', Suspended: 'SUSPENDED' });
export const ShowcaseOverviewPeriod = closedWireType('ShowcaseOverviewPeriod', { Last30Days: 'LAST_30_DAYS' });
export const ShowcaseFactState = closedWireType('ShowcaseFactState', { Known: 'KNOWN', Unavailable: 'UNAVAILABLE' });
export const ShowcaseHomeKind = closedWireType('ShowcaseHomeKind', { Hero: 'HERO', Categories: 'CATEGORY_RAIL', Products: 'PRODUCT_RAIL', Banner: 'PROMO_BANNER' });
export const ShowcasePendingReason = closedWireType('ShowcasePendingReason', { NoPayment: 'NO_PAYMENT', Pending: 'PENDING', Rejected: 'REJECTED' });
export const ShowcaseShipmentState = closedWireType('ShowcaseShipmentState', { Missing: 'MISSING', Pending: 'PENDING', Preparing: 'PREPARING', Shipped: 'SHIPPED' });
export const ShowcaseProductStatus = closedWireType('ShowcaseProductStatus', { Draft: 'DRAFT', Active: 'ACTIVE', Archived: 'ARCHIVED' });
export const ShowcaseVariantStatus = closedWireType('ShowcaseVariantStatus', { Active: 'ACTIVE', Inactive: 'INACTIVE' });
export const ShowcaseInventoryState = closedWireType('ShowcaseInventoryState', { Known: 'KNOWN', Missing: 'MISSING' });
export const ShowcaseVariantAvailability = closedWireType('ShowcaseVariantAvailability', { Available: 'AVAILABLE', OutOfStock: 'OUT_OF_STOCK', Unavailable: 'UNAVAILABLE' });
export const ShowcaseUnavailableReason = closedWireType('ShowcaseUnavailableReason', {
  Payment: 'PAYMENT_FACTS_INCOMPLETE', Shipment: 'SHIPMENT_FACTS_INCOMPLETE', Inventory: 'INVENTORY_FACTS_INCOMPLETE',
});
export const ShowcaseExternalCapability = closedWireType('ShowcaseExternalCapability', {
  Marketplace: 'MARKETPLACE_ML', PriceAutomation: 'ML_PRICE_AUTOMATION', Promotions: 'ML_PROMOTION_ORCHESTRATOR',
  Insights: 'ML_COMPETITION_INSIGHTS', Kits: 'ML_VIRTUAL_KITS', Carriers: 'CARRIERS', Blackstore: 'BLACKSTORE_INTEGRATION',
});

const PRODUCTS = Object.freeze([
  Object.freeze({ sku: 'SHOW-TALADRO-18V', name: 'Taladro percutor 18V', description: 'Taladro inalámbrico para taller con dos baterías.', brand: 'Showcase Tools', category: 'Herramientas eléctricas', image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c', price: 189900, stock: 12 }),
  Object.freeze({ sku: 'SHOW-AMOLADORA-850', name: 'Amoladora angular 850W', description: 'Amoladora compacta con protector regulable.', brand: 'Showcase Tools', category: 'Herramientas eléctricas', image: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8', price: 87900, stock: 8 }),
  Object.freeze({ sku: 'SHOW-SET-MANUAL', name: 'Set de herramientas 108 piezas', description: 'Kit organizado para mantenimiento general.', brand: 'Showcase Pro', category: 'Herramientas manuales', image: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc', price: 149500, stock: 15 }),
]);

const SHOWCASE_ADDRESS = Object.freeze({
  street: 'Avenida Siempre Viva',
  number: '2209',
  city: 'Córdoba',
  province: 'Córdoba',
  postalCode: '5000',
  isDefault: true,
});
const SHOWCASE_HOME = Object.freeze({ key: 'showcase-home-v1', kind: ShowcaseHomeKind.Hero.wire, active: true, sortOrder: 0,
  content: { title: 'Todo para tu taller, en un solo lugar', body: 'Herramientas seleccionadas, stock visible y compra simple.' } });
const SHOWCASE_OFFER_NAME = 'SHOWCASE_LOCAL_OFFER_V1';

export class ShowcaseConfig {
  constructor({ baseUrl, origin, adminEmail, adminPassword, customerEmail, customerPassword, includePendingOrder }) {
    const target = new URL(required(baseUrl, 'STORECORE_SHOWCASE_BASE_URL'));
    const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (target.protocol !== 'http:' || !allowedHosts.has(target.hostname)) throw new Error('SHOWCASE_LOOPBACK_TARGET_REQUIRED');
    const browserOrigin = new URL(required(origin, 'STORECORE_SHOWCASE_ORIGIN'));
    if (browserOrigin.protocol !== 'http:' || !allowedHosts.has(browserOrigin.hostname)) throw new Error('SHOWCASE_LOOPBACK_ORIGIN_REQUIRED');
    this.baseUrl = target.href.replace(/\/$/, '');
    this.origin = browserOrigin.origin;
    this.adminEmail = required(adminEmail, 'STORECORE_SHOWCASE_ADMIN_EMAIL');
    this.adminPassword = required(adminPassword, 'STORECORE_SHOWCASE_ADMIN_PASSWORD');
    this.customerEmail = customerEmail?.trim() || 'showcase.customer@storecore.invalid';
    if (!this.customerEmail.endsWith('.invalid')) throw new Error('SHOWCASE_CUSTOMER_MUST_USE_INVALID_TLD');
    this.customerPassword = customerPassword?.trim() || 'StoreCore-showcase-2026!';
    this.includePendingOrder = includePendingOrder === true || includePendingOrder === 'true';
    Object.freeze(this);
  }

  static fromEnvironment(env = process.env) {
    return new ShowcaseConfig({
      baseUrl: env.STORECORE_SHOWCASE_BASE_URL,
      origin: env.STORECORE_SHOWCASE_ORIGIN,
      adminEmail: env.STORECORE_SHOWCASE_ADMIN_EMAIL,
      adminPassword: env.STORECORE_SHOWCASE_ADMIN_PASSWORD,
      customerEmail: env.STORECORE_SHOWCASE_CUSTOMER_EMAIL,
      customerPassword: env.STORECORE_SHOWCASE_CUSTOMER_PASSWORD,
      includePendingOrder: env.STORECORE_SHOWCASE_INCLUDE_PENDING_ORDER,
    });
  }
}

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}_REQUIRED`);
  return value.trim();
}

class HttpSession {
  #cookie = '';
  #csrf = '';
  constructor(config) { this.config = config; }

  async request(path, { method = 'GET', body, expected = [200], csrf = false, envelope = true, envelopeCode } = {}) {
    const headers = { Accept: 'application/json', Origin: this.config.origin };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.#cookie) headers.Cookie = this.#cookie;
    if (csrf) {
      if (!this.#csrf) throw new Error('SHOWCASE_CSRF_NOT_AVAILABLE');
      headers['X-CSRF-Token'] = this.#csrf;
    }
    const response = await fetch(`${this.config.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error' });
    this.#capture(response);
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!expected.includes(response.status)) {
      const code = payload?.errorCode ?? `HTTP_${response.status}`;
      throw new Error(`${method} ${path}: ${code}`);
    }
    if (!envelope) return payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        payload.code !== (envelopeCode ?? response.status) || !Object.hasOwn(payload, 'data') ||
        (response.ok && (payload.data === null || payload.errorCode != null))) throw new Error(`INVALID_BASE_RESPONSE:${method}:${path}`);
    return payload.data;
  }

  #capture(response) {
    const rawCookie = response.headers.get('set-cookie');
    if (rawCookie) this.#cookie = rawCookie.split(';', 1)[0];
    const nextCsrf = response.headers.get('x-csrf-token');
    if (nextCsrf) this.#csrf = nextCsrf;
  }
}

class ShowcaseContext {
  constructor(config) {
    this.config = config;
    this.admin = new HttpSession(config);
    this.customer = new HttpSession(config);
    this.addressId = null;
    this.orderReceipt = null;
    this.customerId = null;
    this.offerId = null;
    this.favoriteSku = PRODUCTS[0].sku;
    this.home = null;
    this.cart = null;
    this.createdProducts = new Map();
  }
}

function step(stage, run) { return Object.freeze({ stage, run }); }

function requireArray(value, code) {
  if (!Array.isArray(value)) throw new Error(code);
  return value;
}

async function allPages(session, path, pageSize = 'size') {
  const items = [];
  let total;
  for (let page = 0; page < 100; page++) {
    const result = await session.request(`${path}${path.includes('?') ? '&' : '?'}page=${page}${pageSize === 'size' ? '&size=50' : ''}`);
    if (!result || result.page !== page || !Number.isSafeInteger(result.total) || result.total < 0 ||
        !Number.isSafeInteger(result[pageSize]) || result[pageSize] < 1 || result[pageSize] > 50 ||
        !Array.isArray(result.items) || result.items.length > result[pageSize] ||
        (total !== undefined && result.total !== total)) throw new Error('SHOWCASE_INVALID_PAGE');
    total = result.total;
    items.push(...result.items);
    if (result.items.some((item) => !validOrderId(item?.id)) ||
        new Set(items.map((item) => String(item.id))).size !== items.length) throw new Error('SHOWCASE_INVALID_PAGE');
    if (items.length > total) throw new Error('SHOWCASE_INVALID_PAGE');
    if (items.length === total) return items;
    if (result.items.length !== result[pageSize]) throw new Error('SHOWCASE_INVALID_PAGE');
  }
  throw new Error('SHOWCASE_PAGE_LIMIT_EXCEEDED');
}

function capabilityRows(raw) {
  const rows = requireArray(raw, 'SHOWCASE_CAPABILITIES_INVALID');
  if (new Set(rows.map((row) => row?.module)).size !== rows.length) throw new Error('SHOWCASE_CAPABILITIES_INVALID');
  return rows;
}

async function externalSafety(ctx) {
  const safety = await ctx.admin.request('/api/v1/user/showcase-safety');
  if (ShowcaseAdapterMode.fromWire(safety?.mpOrdersAdapter) !== ShowcaseAdapterMode.Unconfigured || safety?.externalCheckoutDisabled !== true) {
    throw new Error('SHOWCASE_EXTERNAL_ADAPTER_CONFIGURED');
  }
  const modules = capabilityRows(await ctx.admin.request('/api/v1/user/capabilities'));
  const external = capabilityRows(safety.externalCapabilities);
  for (const capability of ShowcaseExternalCapability.values) {
    const row = external.find((module) => ShowcaseExternalCapability.fromWire(module.module) === capability);
    if (!row || ShowcaseCapabilityState.fromWire(row.state) !== ShowcaseCapabilityState.Disabled) throw new Error('SHOWCASE_EXTERNAL_CAPABILITY_ENABLED');
    if (capability !== ShowcaseExternalCapability.Blackstore) {
      const visible = modules.find((module) => ShowcaseExternalCapability.fromWire(module.module) === capability);
      if (!visible || ShowcaseCapabilityState.fromWire(visible.state) !== ShowcaseCapabilityState.Disabled) throw new Error('SHOWCASE_EXTERNAL_CAPABILITY_ENABLED');
    }
  }
  return modules;
}

function requireOffer(offer) {
  if (!offer || !Number.isSafeInteger(offer.id) || offer.id <= 0 || offer.name !== SHOWCASE_OFFER_NAME ||
      !Array.isArray(offer.skus) || offer.skus.length !== 1 || offer.skus[0] !== PRODUCTS[0].sku ||
      ShowcaseOfferStatus.fromWire(offer.status) === ShowcaseOfferStatus.Unknown ||
      ShowcaseDiscountKind.fromWire(offer.discountKind) === ShowcaseDiscountKind.Unknown ||
      !Number.isSafeInteger(offer.priority) || typeof offer.discountValue !== 'number' || !Number.isFinite(offer.discountValue) ||
      offer.discountValue <= 0 || (ShowcaseDiscountKind.fromWire(offer.discountKind) === ShowcaseDiscountKind.Percent && offer.discountValue > 100) ||
      offer.minMarginPercent !== 0 || !Number.isFinite(Date.parse(offer.startsAt)) || !Number.isFinite(Date.parse(offer.endsAt)) ||
      Date.parse(offer.startsAt) >= Date.parse(offer.endsAt)) throw new Error('SHOWCASE_OFFER_VERIFICATION_FAILED');
  return offer;
}

function offerFingerprint(offer) {
  return JSON.stringify([offer.id, offer.name, ShowcaseOfferStatus.fromWire(offer.status).wire, offer.priority,
    Date.parse(offer.startsAt), Date.parse(offer.endsAt), ShowcaseDiscountKind.fromWire(offer.discountKind).wire,
    offer.discountValue, offer.minMarginPercent, offer.skus]);
}

function requireCreatedProduct(actual, fixture, reserved = 0, identity) {
  const variants = actual?.variants;
  const variant = Array.isArray(variants) && variants.length === 1 ? variants[0] : null;
  const balance = variant?.inventory;
  const available = fixture.stock - reserved;
  if (!actual || !validOrderId(actual.id) || actual.sku !== fixture.sku || actual.name !== fixture.name ||
      actual.description !== fixture.description || actual.brand !== fixture.brand || actual.category !== fixture.category ||
      ShowcaseProductStatus.fromWire(actual.status) !== ShowcaseProductStatus.Active || actual.active !== true ||
      actual.price?.base !== fixture.price || actual.price.original !== fixture.price || actual.price.effective !== fixture.price || actual.price.offer !== null ||
      !variant || !validOrderId(variant.id) || variant.sku !== fixture.sku || variant.name !== fixture.name ||
      ShowcaseVariantStatus.fromWire(variant.status) !== ShowcaseVariantStatus.Active || variant.active !== true ||
      ShowcaseVariantAvailability.fromWire(variant.availability) !== ShowcaseVariantAvailability.Available || variant.availableQuantity !== available ||
      ShowcaseInventoryState.fromWire(balance?.state) !== ShowcaseInventoryState.Known || balance.variantId !== variant.id || balance.sku !== fixture.sku ||
      balance.available !== available || balance.reserved !== reserved || balance.safety !== 0 || balance.onHand !== fixture.stock ||
      balance.onHand !== balance.available + balance.reserved || balance.saleable !== Math.max(balance.available - balance.safety, 0) ||
      balance.saleable !== available || !Number.isFinite(Date.parse(balance.updatedAt)) ||
      !Array.isArray(actual.media) || actual.media.length !== 1 || !validOrderId(actual.media[0]?.id) ||
      actual.media[0].url !== fixture.image || actual.media[0].sortOrder !== 0 || actual.media[0].primary !== true ||
      !Array.isArray(actual.images) || actual.images.length !== 1 || actual.images[0] !== fixture.image ||
      (identity && (actual.id !== identity.id || variant.id !== identity.variantId || actual.media[0].id !== identity.mediaId))) {
    throw new Error('SHOWCASE_CATALOG_VERIFICATION_FAILED');
  }
  return Object.freeze({ id: actual.id, variantId: variant.id, mediaId: actual.media[0].id });
}

function requireFavorites(raw) {
  const favorites = requireArray(raw, 'SHOWCASE_FAVORITES_VERIFICATION_FAILED');
  if (favorites.length > 200 || new Set(favorites.map((item) => item?.sku)).size !== favorites.length ||
      favorites.some((item) => typeof item?.sku !== 'string' ||
        typeof item.name !== 'string' || !item.name.trim() || typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0 ||
        !Number.isFinite(Date.parse(item.addedAt)) || (item.imageUrl !== null && typeof item.imageUrl !== 'string') ||
        ShowcaseFavoriteAvailability.fromWire(item.availability) === ShowcaseFavoriteAvailability.Unknown)) throw new Error('SHOWCASE_FAVORITES_VERIFICATION_FAILED');
  return favorites;
}

export function requireOverview(overview) {
  const invalid = () => { throw new Error('SHOWCASE_OVERVIEW_VERIFICATION_FAILED'); };
  if (ShowcaseOverviewPeriod.fromWire(overview?.period) !== ShowcaseOverviewPeriod.Last30Days ||
      typeof overview?.timezone !== 'string' || !overview.timezone ||
      !Number.isFinite(Date.parse(overview.fromInclusive)) || !Number.isFinite(Date.parse(overview.toExclusive)) ||
      Date.parse(overview.fromInclusive) >= Date.parse(overview.toExclusive)) invalid();
  try { new Intl.DateTimeFormat('en', { timeZone: overview.timezone }).format(); } catch { invalid(); }
  for (const key of ['accreditedRevenue', 'orderCount', 'activeCustomerCount', 'inventoryAtRiskCount', 'pendingPayments', 'fulfillment', 'lowStock']) {
    const fact = overview[key];
    const state = ShowcaseFactState.fromWire(fact?.state);
    const queue = ['pendingPayments', 'fulfillment', 'lowStock'].includes(key);
    if (state === ShowcaseFactState.Unknown) invalid();
    if (state === ShowcaseFactState.Unavailable) {
      if (ShowcaseUnavailableReason.fromWire(fact.reason) === ShowcaseUnavailableReason.Unknown ||
          (queue ? !Array.isArray(fact.items) || fact.items.length !== 0 || fact.totalCount !== null || fact.truncated !== false : fact.value !== null)) invalid();
    } else {
      if (fact.reason !== null) invalid();
      if (queue) {
        if (!Array.isArray(fact.items) || !Number.isSafeInteger(fact.totalCount) || fact.totalCount < fact.items.length ||
            fact.truncated !== (fact.totalCount > fact.items.length)) invalid();
        for (const item of fact.items) {
          if (key === 'lowStock') {
            if (!Number.isSafeInteger(item?.variantId) || typeof item.sku !== 'string' ||
                !Number.isSafeInteger(item.availableQuantity) || item.availableQuantity < 0 ||
                !Number.isSafeInteger(item.safetyStock) || item.safetyStock < 0) invalid();
          } else if (!Number.isSafeInteger(item?.orderId) || item.orderId <= 0 || typeof item.orderNumber !== 'string' ||
              typeof item.total !== 'number' || !Number.isFinite(item.total) || item.total < 0 ||
              (key === 'pendingPayments' ? ShowcasePendingReason.fromWire(item.reason) === ShowcasePendingReason.Unknown || !Number.isFinite(Date.parse(item.createdAt))
                : ShowcaseShipmentState.fromWire(item.shipmentState) === ShowcaseShipmentState.Unknown || !Number.isFinite(Date.parse(item.paidAt)))) invalid();
        }
      } else if (typeof fact.value !== 'number' || !Number.isFinite(fact.value) || fact.value < 0 ||
          (key !== 'accreditedRevenue' && !Number.isSafeInteger(fact.value))) invalid();
    }
  }
  return overview;
}

const STEPS = Object.freeze([
  step(ShowcaseStage.Preflight, async (ctx) => {
    const health = await ctx.admin.request('/api/v1/health', { envelope: false });
    if (health?.status !== 'UP') throw new Error('SHOWCASE_BACKEND_NOT_READY');
  }),
  step(ShowcaseStage.AdminAuthentication, async (ctx) => {
    const principal = await ctx.admin.request('/api/v1/internal/auth/login', { method: 'POST', body: { email: ctx.config.adminEmail, password: ctx.config.adminPassword } });
    const roles = Array.isArray(principal?.roles) ? principal.roles.map(ShowcaseRole.fromWire) : [];
    if (!roles.includes(ShowcaseRole.Admin)) throw new Error('SHOWCASE_ADMIN_ROLE_REQUIRED');
  }),
  step(ShowcaseStage.ExternalSafety, externalSafety),
  step(ShowcaseStage.CapabilityActivation, async (ctx) => {
    const modules = capabilityRows(await ctx.admin.request('/api/v1/user/capabilities'));
    const byModule = new Map(modules.map((module) => [ShowcaseCapability.fromWire(module.module), module]));
    // Validate the entire activation plan before the first write.
    for (const capability of ShowcaseCapability.values) {
      const module = byModule.get(capability);
      if (!module || !Number.isSafeInteger(module.configVersion) || module.configVersion < 1 || module.configVersion > 2147483647) throw new Error(`SHOWCASE_CAPABILITY_MISSING:${capability.wire}`);
      const state = ShowcaseCapabilityState.fromWire(module.state);
      if (state === ShowcaseCapabilityState.Active) continue;
      if (state !== ShowcaseCapabilityState.Disabled) throw new Error(`SHOWCASE_CAPABILITY_STATE_UNSUPPORTED:${capability.wire}`);
    }
    for (const capability of ShowcaseCapability.values) {
      const module = byModule.get(capability);
      if (ShowcaseCapabilityState.fromWire(module.state) === ShowcaseCapabilityState.Active) continue;
      await ctx.admin.request(`/api/v1/user/capabilities/${capability.wire}/state`, {
        method: 'POST', csrf: true,
        body: { state: ShowcaseCapabilityState.Active.wire, expectedConfigVersion: module.configVersion, reason: 'LOCAL_SHOWCASE_ACTIVATION' },
      });
    }
  }),
  step(ShowcaseStage.CommercialContent, async (ctx) => {
    const home = await ctx.admin.request('/api/v1/user/content/home');
    if (!Number.isSafeInteger(home?.revision) || !Array.isArray(home.sections)) throw new Error('SHOWCASE_HOME_VERIFICATION_FAILED');
    ctx.home = home.sections.length === 0
      ? await ctx.admin.request('/api/v1/user/content/home', { method: 'PUT', csrf: true, body: { expectedRevision: home.revision, sections: [SHOWCASE_HOME] } })
      : home;
    if (!Array.isArray(ctx.home?.sections) || (home.sections.length === 0 &&
        (ctx.home.sections.length !== 1 || ctx.home.sections[0].key !== SHOWCASE_HOME.key ||
        JSON.stringify(ctx.home.sections[0].content) !== JSON.stringify(SHOWCASE_HOME.content)))) throw new Error('SHOWCASE_HOME_VERIFICATION_FAILED');
    for (const product of PRODUCTS) {
      const existing = await ctx.admin.request(`/api/v1/user/catalog/products/${encodeURIComponent(product.sku)}`, { expected: [200, 404] });
      if (existing !== null) continue;
      const created = await ctx.admin.request(`/api/v1/user/catalog/products/${encodeURIComponent(product.sku)}`, {
        method: 'PUT', csrf: true,
        body: { sku: product.sku, name: product.name, description: product.description, brand: product.brand, category: product.category, images: [product.image], price: { base: product.price }, active: true, variants: [{ sku: product.sku, name: product.name, availableQuantity: product.stock, stockAdjustmentReason: 'LOCAL_SHOWCASE_RECONCILIATION' }] },
      });
      ctx.createdProducts.set(product.sku, requireCreatedProduct(created, product));
    }
  }),
  step(ShowcaseStage.CustomerIdentity, async (ctx) => {
    let principal = await ctx.customer.request('/api/v1/customer/auth/login', {
      method: 'POST', expected: [200, 401],
      body: { email: ctx.config.customerEmail, password: ctx.config.customerPassword },
    });
    if (principal === null) principal = await ctx.customer.request('/api/v1/customer/auth/register', {
      method: 'POST', expected: [201],
      body: { email: ctx.config.customerEmail, password: ctx.config.customerPassword, firstName: 'Cliente', lastName: 'Showcase' },
    });
    if (!Number.isSafeInteger(principal?.id) || principal.id <= 0) throw new Error('SHOWCASE_CUSTOMER_IDENTITY_INVALID');
    ctx.customerId = principal.id;
    const profile = await ctx.customer.request('/api/v1/customer/me');
    if (profile?.id !== ctx.customerId || profile.email !== ctx.config.customerEmail) throw new Error('SHOWCASE_CUSTOMER_IDENTITY_INVALID');
  }),
  step(ShowcaseStage.CustomerAddress, async (ctx) => {
    const addresses = requireArray(await ctx.customer.request('/api/v1/customer/me/addresses'), 'SHOWCASE_ADDRESSES_INVALID');
    // Reuse the existing account's address; never restore fixture fields over operator edits.
    const address = addresses[0] ?? await ctx.customer.request('/api/v1/customer/me/addresses', { method: 'POST', csrf: true, body: SHOWCASE_ADDRESS });
    if (address?.id == null) throw new Error('SHOWCASE_ADDRESSES_INVALID');
    ctx.addressId = String(address.id);
  }),
  step(ShowcaseStage.PendingOrder, async (ctx) => {
    if (!ctx.config.includePendingOrder) return;
    const orders = await allPages(ctx.customer, '/api/v1/customer/orders');
    const matches = orders.filter((order) => Array.isArray(order?.lines) && order.lines.some((line) => line?.sku === PRODUCTS[0].sku));
    if (matches.length > 1) throw new Error('SHOWCASE_ORDER_OWNERSHIP_AMBIGUOUS');
    const existing = matches[0];
    if (existing) {
      requirePendingOrder(existing);
      requireOrderIdentity(existing, existing.id);
      ctx.orderId = existing.id;
      return;
    }
    const cart = await ctx.customer.request('/api/v1/customer/cart');
    if (!Array.isArray(cart?.lines) || cart.lines.length !== 0) throw new Error('SHOWCASE_CHECKOUT_REQUIRES_EMPTY_CART');
    await ctx.customer.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: PRODUCTS[0].sku, quantity: 1 } });
    const receipt = await ctx.customer.request('/api/v1/customer/checkout', { method: 'POST', csrf: true, body: { idempotencyKey: '2f5570dc-70b8-4f1c-a217-71f82f6ebc45', addressId: ctx.addressId, currency: 'ARS' } });
    requirePendingOrder(receipt);
    if (!validOrderId(receipt?.orderId) || receipt.checkoutUrl != null) throw new Error('SHOWCASE_ORDER_VERIFICATION_FAILED');
    ctx.orderReceipt = receipt;
    ctx.orderId = receipt.orderId;
  }),
  step(ShowcaseStage.Cart, async (ctx) => {
    ctx.cart = await ctx.customer.request('/api/v1/customer/cart');
    if (!Array.isArray(ctx.cart?.lines)) throw new Error('SHOWCASE_CART_VERIFICATION_FAILED');
    if (ctx.cart.lines.length !== 0) return;
    await ctx.customer.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: PRODUCTS[1].sku, quantity: 1 } });
    ctx.cart = await ctx.customer.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: PRODUCTS[2].sku, quantity: 2 } });
    if (!Array.isArray(ctx.cart?.lines) || ctx.cart.lines.length !== 2 ||
        !ctx.cart.lines.some((line) => line.sku === PRODUCTS[1].sku && line.quantity === 1) ||
        !ctx.cart.lines.some((line) => line.sku === PRODUCTS[2].sku && line.quantity === 2)) throw new Error('SHOWCASE_CART_VERIFICATION_FAILED');
  }),
  step(ShowcaseStage.Favorites, async (ctx) => {
    const before = requireFavorites(await ctx.customer.request('/api/v1/customer/favorites'));
    if (!before.some((item) => item.sku === ctx.favoriteSku)) {
      const mutation = await ctx.customer.request(`/api/v1/customer/favorites/${encodeURIComponent(ctx.favoriteSku)}`, { method: 'PUT', csrf: true });
      if (mutation?.sku !== ctx.favoriteSku || ShowcaseFavoriteOutcome.fromWire(mutation.outcome) === ShowcaseFavoriteOutcome.Unknown) throw new Error('SHOWCASE_FAVORITES_VERIFICATION_FAILED');
    }
    const after = requireFavorites(await ctx.customer.request('/api/v1/customer/favorites'));
    if (!after.some((item) => item.sku === ctx.favoriteSku) || before.some((item) => !after.some((candidate) => candidate.sku === item.sku && candidate.addedAt === item.addedAt))) throw new Error('SHOWCASE_FAVORITES_VERIFICATION_FAILED');
  }),
  step(ShowcaseStage.Offers, async (ctx) => {
    const offers = requireArray(await ctx.admin.request('/api/v1/user/offers'), 'SHOWCASE_OFFER_VERIFICATION_FAILED');
    const matches = offers.filter((offer) => offer?.name === SHOWCASE_OFFER_NAME);
    if (matches.length > 1) throw new Error('SHOWCASE_OFFER_OWNERSHIP_AMBIGUOUS');
    const now = Date.now();
    const draft = { name: SHOWCASE_OFFER_NAME, priority: 0, startsAt: new Date(now - 60000).toISOString(),
      endsAt: new Date(now + 30 * 86400000).toISOString(), discountKind: ShowcaseDiscountKind.Percent.wire,
      discountValue: 10, minMarginPercent: 0, skus: [PRODUCTS[0].sku] };
    const offer = matches[0] ?? await ctx.admin.request('/api/v1/user/offers', {
      method: 'POST', csrf: true, expected: [201], envelopeCode: 200,
      body: draft,
    });
    ctx.offerId = requireOffer(offer).id;
    if (!matches.length && offerFingerprint(offer) !== offerFingerprint({ id: ctx.offerId, ...draft, status: ShowcaseOfferStatus.Draft.wire })) throw new Error('SHOWCASE_OFFER_VERIFICATION_FAILED');
    const readback = requireArray(await ctx.admin.request('/api/v1/user/offers'), 'SHOWCASE_OFFER_VERIFICATION_FAILED');
    const matching = readback.filter((item) => item?.name === SHOWCASE_OFFER_NAME);
    if (matching.length !== 1 || offerFingerprint(requireOffer(matching[0])) !== offerFingerprint(offer)) throw new Error('SHOWCASE_OFFER_VERIFICATION_FAILED');
  }),
  step(ShowcaseStage.CustomerAdministration, async (ctx) => {
    const customers = await allPages(ctx.admin, `/api/v1/user/customers?query=${encodeURIComponent(ctx.config.customerEmail)}`, 'pageSize');
    const matches = customers.filter((customer) => customer?.id === ctx.customerId && customer.email === ctx.config.customerEmail);
    if (matches.length !== 1) throw new Error('SHOWCASE_CUSTOMER_VERIFICATION_FAILED');
    const customer = await ctx.admin.request(`/api/v1/user/customers/${ctx.customerId}`);
    if (customer?.id !== ctx.customerId || customer.email !== ctx.config.customerEmail ||
        ShowcaseCustomerState.fromWire(customer.state) === ShowcaseCustomerState.Unknown ||
        ShowcaseCustomerState.fromWire(customer.state) !== ShowcaseCustomerState.fromWire(matches[0].state) || !Number.isSafeInteger(customer.orderCount) || customer.orderCount < 0 ||
        typeof customer.firstName !== 'string' || typeof customer.lastName !== 'string' ||
        !Number.isFinite(Date.parse(customer.createdAt)) || (customer.lastOrderAt !== null && !Number.isFinite(Date.parse(customer.lastOrderAt)))) throw new Error('SHOWCASE_CUSTOMER_VERIFICATION_FAILED');
  }),
  step(ShowcaseStage.Overview, async (ctx) => {
    requireOverview(await ctx.admin.request(`/api/v1/user/overview?period=${ShowcaseOverviewPeriod.Last30Days.wire}`));
  }),
  step(ShowcaseStage.Verification, async (ctx) => {
    const home = await ctx.admin.request('/api/v1/user/content/home');
    if (JSON.stringify(home) !== JSON.stringify(ctx.home)) throw new Error('SHOWCASE_HOME_VERIFICATION_FAILED');
    for (const product of PRODUCTS) {
      const actual = await ctx.admin.request(`/api/v1/user/catalog/products/${encodeURIComponent(product.sku)}`);
      if (actual?.sku !== product.sku || !Array.isArray(actual.variants) || !actual.variants.some((variant) => variant.sku === product.sku)) throw new Error('SHOWCASE_CATALOG_VERIFICATION_FAILED');
      const identity = ctx.createdProducts.get(product.sku);
      if (identity) requireCreatedProduct(actual, product, ctx.orderReceipt !== null && product === PRODUCTS[0] ? 1 : 0, identity);
    }
    const cart = await ctx.customer.request('/api/v1/customer/cart');
    if (!Array.isArray(cart?.lines) || JSON.stringify(cart) !== JSON.stringify(ctx.cart)) throw new Error('SHOWCASE_CART_VERIFICATION_FAILED');
    if (ctx.orderId != null) {
      const order = await ctx.customer.request(`/api/v1/customer/orders/${encodeURIComponent(ctx.orderId)}`);
      requireOrderIdentity(order, ctx.orderId);
      requirePendingOrder(order);
    }
    await externalSafety(ctx);
  }),
]);

function requirePendingOrder(order) {
  if (ShowcasePaymentStatus.fromWire(order?.paymentStatus) !== ShowcasePaymentStatus.Pending ||
      ShowcaseOrderStatus.fromWire(order?.orderStatus) !== ShowcaseOrderStatus.PendingPayment) {
    throw new Error('SHOWCASE_CHECKOUT_MUST_REMAIN_PENDING');
  }
}

function validOrderId(value) {
  return (typeof value === 'string' && /^[1-9]\d*$/.test(value)) || (Number.isSafeInteger(value) && value > 0);
}

function requireOrderIdentity(order, id) {
  if (!validOrderId(id) || String(order?.id) !== String(id) || !Array.isArray(order.lines) || order.lines.length !== 1 ||
      order.lines[0]?.sku !== PRODUCTS[0].sku || order.lines[0].quantity !== 1) throw new Error('SHOWCASE_ORDER_VERIFICATION_FAILED');
}

export class ShowcaseLoader {
  constructor(config, onProgress = (stage) => console.log(`[showcase] ${stage.label}: OK`)) {
    this.context = new ShowcaseContext(config);
    this.onProgress = onProgress;
  }
  async run() {
    for (const current of STEPS) {
      if (ShowcaseStage.fromWire(current.stage.wire) === ShowcaseStage.Unknown) throw new Error('SHOWCASE_UNKNOWN_STAGE');
      await current.run(this.context);
      this.onProgress(current.stage);
    }
    return Object.freeze({ products: PRODUCTS.length, pendingOrderCreated: this.context.orderReceipt !== null });
  }
}

async function main() {
  const result = await new ShowcaseLoader(ShowcaseConfig.fromEnvironment()).run();
  console.log(`[showcase] completed: ${result.products} products; pending order created: ${result.pendingOrderCreated}`);
}

const invokedAs = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedAs === import.meta.url) main().catch((error) => { console.error(`[showcase] failed: ${error.message}`); process.exitCode = 1; });
