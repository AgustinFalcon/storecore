import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ShowcaseDataset, DEFAULT_SHOWCASE_DATASET } from './showcase-dataset.mjs';
import { readShowcaseDataset } from './read-showcase-dataset.mjs';

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

const DELIVERY_TOKEN = Symbol('ShowcaseDeliveryMode');
export class ShowcaseDeliveryMode {
  static Pickup = new ShowcaseDeliveryMode(DELIVERY_TOKEN, 'PICKUP');
  static LocalDelivery = new ShowcaseDeliveryMode(DELIVERY_TOKEN, 'LOCAL_DELIVERY');
  static Unknown = new ShowcaseDeliveryMode(DELIVERY_TOKEN, 'UNKNOWN');
  static values = Object.freeze([this.Pickup, this.LocalDelivery]);
  constructor(token, wire) { if (token !== DELIVERY_TOKEN) throw new TypeError('ShowcaseDeliveryMode is closed'); this.wire = wire; Object.freeze(this); }
  static fromWire(raw) { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
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

export const ShowcaseReceiptScenario = closedWireType('ShowcaseReceiptScenario', { Populated: 'POPULATED', InvalidSecret: 'INVALID_SECRET' });
export const ShowcaseReceiptEvidence = closedWireType('ShowcaseReceiptEvidence', { RealBackend: 'REAL_BACKEND' });
export const ShowcaseOfferStatus = closedWireType('ShowcaseOfferStatus', { Draft: 'DRAFT', Active: 'ACTIVE', Paused: 'PAUSED', Ended: 'ENDED' });
export const ShowcaseDiscountKind = closedWireType('ShowcaseDiscountKind', { Percent: 'PERCENT', Fixed: 'FIXED' });
export const ShowcaseOfferTransition = closedWireType('ShowcaseOfferTransition', { Activate: 'ACTIVATE', Pause: 'PAUSE', End: 'END' });
export const ShowcaseImportProgress = closedWireType('ShowcaseImportProgress', { Pending: 'PENDING' });
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

const SHOWCASE_ADDRESS = Object.freeze({
  street: 'Avenida Siempre Viva',
  number: '2209',
  city: 'Córdoba',
  province: 'Córdoba',
  postalCode: '5000',
  isDefault: true,
});
const SHOWCASE_OFFER_NAME = 'SHOWCASE_LOCAL_OFFER_V1';
const SHOWCASE_IMPORT_MARKER_KEY = 'storecore-showcase-v3-import-pending';

function legacyExperience(dataset) {
  return Object.freeze({
    cart: Object.freeze([{ sku: dataset.journey.cart.sku, quantity: 1 }, { sku: dataset.journey.secondaryCart.sku, quantity: 2 }]),
    favoriteSkus: Object.freeze([dataset.journey.primary.sku]),
    addresses: Object.freeze([SHOWCASE_ADDRESS]),
    offers: null,
    homeSections: null,
  });
}

export class ShowcaseConfig {
  constructor({ baseUrl, origin, adminEmail, adminPassword, customerEmail, customerPassword, includePendingOrder, manualFulfillmentPolicy, scenarioPrefix, requireRealRouteReceipt }) {
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
    // Existing showcase imports preserve arbitrary operator data. The real route
    // runner opts into a populated, internally coherent receipt and fails closed.
    this.requireRealRouteReceipt = requireRealRouteReceipt === true || requireRealRouteReceipt === 'true';
    if (this.requireRealRouteReceipt && !this.includePendingOrder) throw new Error('SHOWCASE_REAL_RECEIPT_REQUIRES_PENDING_ORDER');
    this.scenarioPrefix = scenarioPrefix?.trim() || 'showcase-v1';
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(this.scenarioPrefix)) throw new Error('SHOWCASE_SCENARIO_PREFIX_INVALID');
    this.manualFulfillmentPolicy = manualFulfillmentPolicy == null || manualFulfillmentPolicy === '' ? null
      : typeof manualFulfillmentPolicy === 'string' ? JSON.parse(manualFulfillmentPolicy) : manualFulfillmentPolicy;
    if (this.manualFulfillmentPolicy !== null && (typeof this.manualFulfillmentPolicy !== 'object' || Array.isArray(this.manualFulfillmentPolicy))) throw new Error('SHOWCASE_DELIVERY_POLICY_INVALID');
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
      manualFulfillmentPolicy: env.STORECORE_SHOWCASE_DELIVERY_POLICY,
      scenarioPrefix: env.STORECORE_SHOWCASE_SCENARIO_PREFIX,
      requireRealRouteReceipt: env.STORECORE_SHOWCASE_REQUIRE_REAL_ROUTE_RECEIPT,
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
  constructor(config, dataset) {
    this.config = config;
    this.dataset = ShowcaseDataset.require(dataset);
    this.richExperience = dataset.experience !== null;
    this.experience = dataset.experience ?? legacyExperience(dataset);
    this.journey = this.dataset.journey;
    this.journey.requireBudget(config.manualFulfillmentPolicy?.localDelivery?.cost);
    this.homeFixtures = null;
    this.admin = new HttpSession(config);
    this.customer = new HttpSession(config);
    this.addressId = null;
    this.addressRevision = null;
    this.addressStreet = null;
    this.products = [];
    this.orderReceipt = null;
    this.customerId = null;
    this.offerId = null;
    this.offerIds = [];
    this.favoriteSku = this.journey.primary.sku;
    this.home = null;
    this.lifecycleResumeAllowed = false;
    this.cart = null;
    this.createdProducts = new Map();
  }
}

function fixtureAddress(address) {
  return { street: address.street, number: address.number, city: address.city, province: address.province,
    postalCode: address.postalCode, isDefault: address.isDefault };
}
function sameFixtureAddress(actual, fixture) {
  return actual?.street === fixture.street && actual.number === fixture.number && actual.city === fixture.city &&
    actual.province === fixture.province && actual.postalCode === fixture.postalCode;
}

function buildHomeFixtures(ctx, categories) {
  if (ctx.experience.homeSections === null) return [Object.freeze({ key: 'showcase-home-v1', kind: ShowcaseHomeKind.Hero.wire,
    active: true, sortOrder: 0, content: ctx.dataset.home })];
  const categoryByName = new Map(categories.map(category => [String(category.name).toLowerCase(), category.id]));
  return ctx.experience.homeSections.map(section => {
    let content = section.content;
    if (section.kind.wire === ShowcaseHomeKind.Categories.wire) {
      const categoryIds = content.categoryNames.map(name => categoryByName.get(name.toLowerCase()));
      if (categoryIds.some(id => !validOrderId(id))) throw new Error('SHOWCASE_HOME_CATEGORY_NOT_FOUND');
      content = { title: content.title, categoryIds };
    }
    return Object.freeze({ key: section.key, kind: section.kind.wire, active: section.active, sortOrder: section.sortOrder, content });
  });
}

function writableHomeSection(section) {
  return { key: section.key, kind: section.kind, active: section.active, sortOrder: section.sortOrder, content: section.content };
}

function importMarker(ctx, sections) {
  const digest = createHash('sha256').update(JSON.stringify(ctx.dataset)).digest('hex');
  const sortOrder = sections.reduce((maximum, section) => Math.max(maximum, Number.isSafeInteger(section?.sortOrder) ? section.sortOrder : 0), 0) + 1;
  return Object.freeze({ key: SHOWCASE_IMPORT_MARKER_KEY, kind: ShowcaseHomeKind.Banner.wire, active: false, sortOrder,
    content: Object.freeze({ title: 'Importación local en progreso', body: `${ShowcaseImportProgress.Pending.wire}:${digest}`, ctaLabel: null, ctaPath: null }) });
}

function requireImportMarker(actual, expected) {
  if (actual?.key !== expected.key || actual.kind !== expected.kind || actual.active !== false ||
      actual.content?.title !== expected.content.title || actual.content.body !== expected.content.body ||
      actual.content.ctaLabel != null || actual.content.ctaPath != null) throw new Error('SHOWCASE_IMPORT_PROGRESS_INVALID');
  const [rawState, rawDigest, ...extra] = actual.content.body.split(':');
  if (ShowcaseImportProgress.fromWire(rawState) !== ShowcaseImportProgress.Pending ||
      !/^[a-f0-9]{64}$/.test(rawDigest) || extra.length !== 0) throw new Error('SHOWCASE_IMPORT_PROGRESS_INVALID');
  return actual;
}

async function prepareRichImport(ctx) {
  if (!ctx.richExperience) return;
  const home = await ctx.admin.request('/api/v1/user/content/home');
  if (!Number.isSafeInteger(home?.revision) || !Array.isArray(home.sections)) throw new Error('SHOWCASE_HOME_VERIFICATION_FAILED');
  const marker = importMarker(ctx, home.sections);
  const markers = home.sections.filter(section => section?.key === SHOWCASE_IMPORT_MARKER_KEY);
  if (markers.length > 1) throw new Error('SHOWCASE_IMPORT_PROGRESS_INVALID');
  if (markers.length === 1) {
    requireImportMarker(markers[0], marker);
    ctx.lifecycleResumeAllowed = true;
    ctx.home = home;
    return;
  }
  const offers = requireArray(await ctx.admin.request('/api/v1/user/offers'), 'SHOWCASE_OFFER_VERIFICATION_FAILED');
  const expectedNames = new Set(ctx.experience.offers.map(offer => offer.name));
  const owned = offers.filter(offer => expectedNames.has(offer?.name));
  if (new Set(owned.map(offer => offer.name)).size !== owned.length) throw new Error('SHOWCASE_OFFER_OWNERSHIP_AMBIGUOUS');
  if (owned.length !== 0) {
    if (owned.length !== expectedNames.size) throw new Error('SHOWCASE_IMPORT_PROGRESS_MISSING');
    ctx.home = home;
    return;
  }
  ctx.home = await ctx.admin.request('/api/v1/user/content/home', { method: 'PUT', csrf: true,
    body: { expectedRevision: home.revision, sections: [...home.sections.map(writableHomeSection), marker] } });
  const persisted = ctx.home.sections.filter(section => section?.key === SHOWCASE_IMPORT_MARKER_KEY);
  if (persisted.length !== 1) throw new Error('SHOWCASE_IMPORT_PROGRESS_INVALID');
  requireImportMarker(persisted[0], marker);
  ctx.lifecycleResumeAllowed = true;
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

function requireOffer(offer, expected) {
  const canonicalSkus = values => Array.isArray(values) ? [...values].sort((left, right) => left.localeCompare(right)) : null;
  if (!offer || !Number.isSafeInteger(offer.id) || offer.id <= 0 || offer.name !== expected.name ||
      !Array.isArray(offer.skus) || new Set(offer.skus).size !== offer.skus.length ||
      JSON.stringify(canonicalSkus(offer.skus)) !== JSON.stringify(canonicalSkus(expected.skus)) ||
      ShowcaseOfferStatus.fromWire(offer.status) === ShowcaseOfferStatus.Unknown ||
      ShowcaseDiscountKind.fromWire(offer.discountKind) === ShowcaseDiscountKind.Unknown ||
      offer.priority !== expected.priority || offer.discountKind !== expected.discountKind ||
      offer.discountValue !== expected.discountValue ||
      !Number.isSafeInteger(offer.priority) || typeof offer.discountValue !== 'number' || !Number.isFinite(offer.discountValue) ||
      offer.discountValue <= 0 || (ShowcaseDiscountKind.fromWire(offer.discountKind) === ShowcaseDiscountKind.Percent && offer.discountValue > 100) ||
      offer.minMarginPercent !== expected.minMarginPercent || !Number.isFinite(Date.parse(offer.startsAt)) || !Number.isFinite(Date.parse(offer.endsAt)) ||
      Date.parse(offer.startsAt) >= Date.parse(offer.endsAt)) throw new Error('SHOWCASE_OFFER_VERIFICATION_FAILED');
  return offer;
}

function offerFingerprint(offer) {
  return JSON.stringify([offer.id, offer.name, ShowcaseOfferStatus.fromWire(offer.status).wire, offer.priority,
    Date.parse(offer.startsAt), Date.parse(offer.endsAt), ShowcaseDiscountKind.fromWire(offer.discountKind).wire,
    offer.discountValue, offer.minMarginPercent, [...offer.skus].sort((left, right) => left.localeCompare(right))]);
}

function requireCreatedProduct(actual, fixture, reserved = 0, identity, allowOffer = false) {
  const variants = actual?.variants;
  const variant = Array.isArray(variants) && variants.length === 1 ? variants[0] : null;
  const balance = variant?.inventory;
  const available = fixture.stock - reserved;
  const expectedAvailability = available === 0 ? ShowcaseVariantAvailability.OutOfStock : ShowcaseVariantAvailability.Available;
  const priceValid = actual?.price?.base === fixture.price && actual.price.original === fixture.price &&
    (allowOffer
      ? typeof actual.price.effective === 'number' && Number.isFinite(actual.price.effective) && actual.price.effective > 0 && actual.price.effective <= fixture.price
      : actual.price.effective === fixture.price && actual.price.offer === null);
  if (!actual || !validOrderId(actual.id) || actual.sku !== fixture.sku || actual.name !== fixture.name ||
      actual.description !== fixture.description || actual.brand !== fixture.brand || actual.category !== fixture.category ||
      ShowcaseProductStatus.fromWire(actual.status) !== ShowcaseProductStatus.Active || actual.active !== true ||
      !priceValid ||
      !variant || !validOrderId(variant.id) || variant.sku !== fixture.sku || variant.name !== fixture.name ||
      ShowcaseVariantStatus.fromWire(variant.status) !== ShowcaseVariantStatus.Active || variant.active !== true ||
      ShowcaseVariantAvailability.fromWire(variant.availability) !== expectedAvailability || variant.availableQuantity !== available ||
      ShowcaseInventoryState.fromWire(balance?.state) !== ShowcaseInventoryState.Known || balance.variantId !== variant.id || balance.sku !== fixture.sku ||
      balance.available !== available || balance.reserved !== reserved || balance.safety !== 0 || balance.onHand !== fixture.stock ||
      balance.onHand !== balance.available + balance.reserved || balance.saleable !== Math.max(balance.available - balance.safety, 0) ||
      balance.saleable !== available || !Number.isFinite(Date.parse(balance.updatedAt)) ||
      !Array.isArray(actual.media) || actual.media.length !== fixture.images.length ||
      actual.media.some((media, index) => !validOrderId(media?.id) || media.url !== fixture.images[index] ||
        media.sortOrder !== index || media.primary !== (index === 0)) ||
      !Array.isArray(actual.images) || JSON.stringify(actual.images) !== JSON.stringify(fixture.images) ||
      (identity && (actual.id !== identity.id || variant.id !== identity.variantId ||
        JSON.stringify(actual.media.map(media => media.id)) !== JSON.stringify(identity.mediaIds)))) {
    throw new Error('SHOWCASE_CATALOG_VERIFICATION_FAILED');
  }
  return Object.freeze({ id: actual.id, variantId: variant.id, mediaIds: Object.freeze(actual.media.map(media => media.id)) });
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
    if (ctx.config.manualFulfillmentPolicy !== null &&
        ShowcaseCapabilityState.fromWire(byModule.get(ShowcaseCapability.ManualFulfillment).state) !== ShowcaseCapabilityState.Active) {
      const manual = byModule.get(ShowcaseCapability.ManualFulfillment);
      if (manual.configVersion !== 2 || ShowcaseCapabilityState.fromWire(manual.state) !== ShowcaseCapabilityState.Disabled) throw new Error('SHOWCASE_DELIVERY_POLICY_DRIFT');
      const result = await ctx.admin.request('/api/v1/user/capabilities/MANUAL_FULFILLMENT/policy', {
        method:'PUT',csrf:true,body:{...ctx.config.manualFulfillmentPolicy,expectedConfigVersion:manual.configVersion,reason:'LOCAL_SHOWCASE_DELIVERY_OPT_IN',correlationId:randomUUID()},
      });
      if (!Number.isSafeInteger(result?.configurationVersion) || result.configurationVersion <= manual.configVersion) throw new Error('SHOWCASE_DELIVERY_POLICY_INVALID');
      manual.configVersion = result.configurationVersion;
    }
    for (const capability of ShowcaseCapability.values) {
      const module = byModule.get(capability);
      if (ShowcaseCapabilityState.fromWire(module.state) === ShowcaseCapabilityState.Active) continue;
      await ctx.admin.request(`/api/v1/user/capabilities/${capability.wire}/state`, {
        method: 'POST', csrf: true,
        body: { state: ShowcaseCapabilityState.Active.wire, expectedConfigVersion: module.configVersion, reason: 'LOCAL_SHOWCASE_ACTIVATION' },
      });
    }
    // Home and offers are capability-gated. Persist ownership after local
    // capabilities are available, but before the first showcase data mutation.
    // Only this exact marker can authorize an interrupted lifecycle replay.
    await prepareRichImport(ctx);
  }),
  step(ShowcaseStage.CommercialContent, async (ctx) => {
    for (const product of ctx.dataset.products) {
      const existing = await ctx.admin.request(`/api/v1/user/catalog/products/${encodeURIComponent(product.sku)}`, { expected: [200, 404] });
      if (existing !== null) continue;
      const created = await ctx.admin.request(`/api/v1/user/catalog/products/${encodeURIComponent(product.sku)}`, {
        method: 'PUT', csrf: true,
        body: product.toCatalogCommand(),
      });
      ctx.createdProducts.set(product.sku, requireCreatedProduct(created, product));
    }
    const categories = ctx.experience.homeSections === null ? []
      : requireArray(await ctx.admin.request('/api/v1/catalog/categories'), 'SHOWCASE_HOME_CATEGORIES_INVALID');
    ctx.homeFixtures = Object.freeze(buildHomeFixtures(ctx, categories));
    if (ctx.richExperience) {
      if (!Array.isArray(ctx.home?.sections)) throw new Error('SHOWCASE_HOME_VERIFICATION_FAILED');
      return;
    }
    const home = await ctx.admin.request('/api/v1/user/content/home');
    if (!Number.isSafeInteger(home?.revision) || !Array.isArray(home.sections)) throw new Error('SHOWCASE_HOME_VERIFICATION_FAILED');
    ctx.home = home.sections.length === 0
      ? await ctx.admin.request('/api/v1/user/content/home', { method: 'PUT', csrf: true, body: { expectedRevision: home.revision, sections: ctx.homeFixtures } })
      : home;
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
    if (ctx.richExperience) {
      const exact = ctx.experience.addresses.filter(fixture => addresses.some(address => sameFixtureAddress(address, fixture)));
      const resumable = addresses.length === 0 || (addresses.length < ctx.experience.addresses.length && exact.length === addresses.length);
      if (resumable) for (const fixture of ctx.experience.addresses) {
        if (addresses.some(address => sameFixtureAddress(address, fixture))) continue;
        addresses.push(await ctx.customer.request('/api/v1/customer/me/addresses', { method: 'POST', csrf: true, body: fixtureAddress(fixture) }));
      }
    } else if (addresses.length === 0) {
      addresses.push(await ctx.customer.request('/api/v1/customer/me/addresses', { method: 'POST', csrf: true, body: SHOWCASE_ADDRESS }));
    }
    const address = addresses.find(candidate => candidate.isDefault) ?? addresses[0];
    if (address?.id == null) throw new Error('SHOWCASE_ADDRESSES_INVALID');
    ctx.addressId = String(address.id);
    if (!validOrderId(address.id) || typeof address.revision !== 'string' || !Number.isFinite(Date.parse(address.revision))) throw new Error('SHOWCASE_ADDRESSES_INVALID');
    ctx.addressRevision = address.revision;
    ctx.addressStreet = address.street;
  }),
  step(ShowcaseStage.PendingOrder, async (ctx) => {
    if (!ctx.config.includePendingOrder) return;
    const orders = await allPages(ctx.customer, '/api/v1/customer/orders');
    const matches = orders.filter((order) => Array.isArray(order?.lines) && order.lines.some((line) => line?.sku === ctx.journey.primary.sku));
    if (matches.length > 1) throw new Error('SHOWCASE_ORDER_OWNERSHIP_AMBIGUOUS');
    const existing = matches[0];
    if (existing) {
      requirePendingOrder(existing);
      requireOrderIdentity(existing, existing.id, ctx.journey);
      ctx.orderId = existing.id;
      return;
    }
    let cart = await ctx.customer.request('/api/v1/customer/cart');
    if (!Array.isArray(cart?.lines) || cart.lines.length !== 0) throw new Error('SHOWCASE_CHECKOUT_REQUIRES_EMPTY_CART');
    await ctx.customer.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: ctx.journey.primary.sku, quantity: 1 } });
    cart = await ctx.customer.request('/api/v1/customer/cart');
    if (!Array.isArray(cart?.lines) || cart.lines.length !== 1 || cart.lines[0].sku !== ctx.journey.primary.sku || cart.lines[0].quantity !== 1 ||
        typeof cart.revision !== 'string' || !cart.revision.trim()) throw new Error('SHOWCASE_CART_VERIFICATION_FAILED');
    const delivery = requireArray(cart.deliveryOptions, 'SHOWCASE_DELIVERY_OPTIONS_REQUIRED').find(option => ShowcaseDeliveryMode.fromWire(option.mode) === ShowcaseDeliveryMode.LocalDelivery);
    if (!delivery || !Number.isSafeInteger(delivery.configurationVersion) || delivery.configurationVersion < 1 || delivery.currency !== 'ARS' || delivery.requiresAddress !== true) throw new Error('SHOWCASE_DELIVERY_OPTIONS_REQUIRED');
    ctx.journey.requireBudget(delivery.cost ?? null);
    const receipt = await ctx.customer.request('/api/v1/customer/checkout', { method: 'POST', csrf: true, body: { idempotencyKey: '2f5570dc-70b8-4f1c-a217-71f82f6ebc45', addressId: ctx.addressId, addressRevision: ctx.addressRevision, cartRevision: cart.revision, currency: 'ARS', deliveryMode: ShowcaseDeliveryMode.LocalDelivery.wire, deliveryConfigurationVersion: delivery.configurationVersion } });
    requirePendingOrder(receipt);
    if (!validOrderId(receipt?.orderId) || receipt.checkoutUrl != null) throw new Error('SHOWCASE_ORDER_VERIFICATION_FAILED');
    ctx.orderReceipt = receipt;
    ctx.orderId = receipt.orderId;
  }),
  step(ShowcaseStage.Cart, async (ctx) => {
    ctx.cart = await ctx.customer.request('/api/v1/customer/cart');
    if (!Array.isArray(ctx.cart?.lines)) throw new Error('SHOWCASE_CART_VERIFICATION_FAILED');
    if (ctx.cart.lines.length !== 0) return;
    for (const line of ctx.experience.cart) await ctx.customer.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: line });
    ctx.cart = await ctx.customer.request('/api/v1/customer/cart');
    if (!Array.isArray(ctx.cart?.lines) || ctx.cart.lines.length !== ctx.experience.cart.length ||
        ctx.experience.cart.some(expected => !ctx.cart.lines.some(line => line.sku === expected.sku && line.quantity === expected.quantity))) throw new Error('SHOWCASE_CART_VERIFICATION_FAILED');
  }),
  step(ShowcaseStage.Favorites, async (ctx) => {
    const before = requireFavorites(await ctx.customer.request('/api/v1/customer/favorites'));
    for (const sku of ctx.experience.favoriteSkus) {
      if (before.some(item => item.sku === sku)) continue;
      const mutation = await ctx.customer.request(`/api/v1/customer/favorites/${encodeURIComponent(sku)}`, { method: 'PUT', csrf: true });
      if (mutation?.sku !== sku || ShowcaseFavoriteOutcome.fromWire(mutation.outcome) === ShowcaseFavoriteOutcome.Unknown) throw new Error('SHOWCASE_FAVORITES_VERIFICATION_FAILED');
    }
    const after = requireFavorites(await ctx.customer.request('/api/v1/customer/favorites'));
    if (ctx.experience.favoriteSkus.some(sku => !after.some(item => item.sku === sku)) ||
        before.some(item => !after.some(candidate => candidate.sku === item.sku && candidate.addedAt === item.addedAt))) throw new Error('SHOWCASE_FAVORITES_VERIFICATION_FAILED');
  }),
  step(ShowcaseStage.Offers, async (ctx) => {
    const offers = requireArray(await ctx.admin.request('/api/v1/user/offers'), 'SHOWCASE_OFFER_VERIFICATION_FAILED');
    const now = Date.now();
    const fixtures = ctx.experience.offers ?? [{ key: 'legacy', name: SHOWCASE_OFFER_NAME, priority: 0, startsInDays: 0,
      endsInDays: 30, discountKind: ShowcaseDiscountKind.Percent, discountValue: 10, minMarginPercent: 0,
      skus: [ctx.journey.primary.sku], status: ShowcaseOfferStatus.Draft }];
    const captured = new Map();
    for (const fixture of fixtures) {
      const matches = offers.filter(offer => offer?.name === fixture.name);
      if (matches.length > 1) throw new Error('SHOWCASE_OFFER_OWNERSHIP_AMBIGUOUS');
      const draft = { name: fixture.name, priority: fixture.priority,
        startsAt: new Date(now + fixture.startsInDays * 86400000).toISOString(),
        endsAt: new Date(now + fixture.endsInDays * 86400000).toISOString(), discountKind: fixture.discountKind.wire,
        discountValue: fixture.discountValue, minMarginPercent: fixture.minMarginPercent, skus: [...fixture.skus] };
      const created = matches.length === 0;
      let offer = matches[0] ?? await ctx.admin.request('/api/v1/user/offers', {
        method: 'POST', csrf: true, expected: [201], envelopeCode: 200, body: draft,
      });
      requireOffer(offer, created ? draft : { ...offer, skus: [...fixture.skus] });
      captured.set(fixture.name, offerFingerprint(offer));
      const current = ShowcaseOfferStatus.fromWire(offer.status);
      const target = ShowcaseOfferStatus.fromWire(fixture.status.wire);
      const transition = async command => {
        if (!ShowcaseOfferTransition.values.includes(command)) throw new Error('SHOWCASE_OFFER_TRANSITION_UNKNOWN');
        offer = await ctx.admin.request(`/api/v1/user/offers/${offer.id}/state`, { method: 'POST', csrf: true, body: { transition: command.wire } });
      };
      // V3 names are dataset-owned identities. Resume an interrupted lifecycle
      // deterministically; legacy imports keep the operator-owned status intact.
      if ((created || ctx.lifecycleResumeAllowed) && current !== target) {
        if (target === ShowcaseOfferStatus.Active && (current === ShowcaseOfferStatus.Draft || current === ShowcaseOfferStatus.Paused)) await transition(ShowcaseOfferTransition.Activate);
        else if (target === ShowcaseOfferStatus.Paused && current === ShowcaseOfferStatus.Draft) { await transition(ShowcaseOfferTransition.Activate); await transition(ShowcaseOfferTransition.Pause); }
        else if (target === ShowcaseOfferStatus.Paused && current === ShowcaseOfferStatus.Active) await transition(ShowcaseOfferTransition.Pause);
        else if (target === ShowcaseOfferStatus.Ended && current !== ShowcaseOfferStatus.Ended) await transition(ShowcaseOfferTransition.End);
        else throw new Error('SHOWCASE_OFFER_STATUS_MISMATCH');
      }
      if ((created || ctx.lifecycleResumeAllowed) && ShowcaseOfferStatus.fromWire(offer.status) !== target) throw new Error('SHOWCASE_OFFER_STATUS_MISMATCH');
      captured.set(fixture.name, offerFingerprint(offer));
      ctx.offerIds.push(offer.id);
    }
    ctx.offerId = ctx.offerIds[0];
    const readback = requireArray(await ctx.admin.request('/api/v1/user/offers'), 'SHOWCASE_OFFER_VERIFICATION_FAILED');
    for (const fixture of fixtures) {
      const matching = readback.filter(item => item?.name === fixture.name);
      if (matching.length !== 1 || offerFingerprint(requireOffer(matching[0], { ...matching[0], skus: [...fixture.skus] })) !== captured.get(fixture.name)) throw new Error('SHOWCASE_OFFER_VERIFICATION_FAILED');
    }
    if (ctx.lifecycleResumeAllowed) {
      const pendingHome = await ctx.admin.request('/api/v1/user/content/home');
      const marker = importMarker(ctx, pendingHome.sections);
      const markers = pendingHome.sections.filter(section => section?.key === SHOWCASE_IMPORT_MARKER_KEY);
      if (markers.length !== 1) throw new Error('SHOWCASE_IMPORT_PROGRESS_MISSING');
      requireImportMarker(markers[0], marker);
      const preserved = pendingHome.sections.filter(section => section?.key !== SHOWCASE_IMPORT_MARKER_KEY).map(writableHomeSection);
      const completedSections = preserved.length === 0 ? ctx.homeFixtures : preserved;
      ctx.home = await ctx.admin.request('/api/v1/user/content/home', { method: 'PUT', csrf: true,
        body: { expectedRevision: pendingHome.revision, sections: completedSections } });
      if (!Array.isArray(ctx.home?.sections) || ctx.home.sections.some(section => section?.key === SHOWCASE_IMPORT_MARKER_KEY)) throw new Error('SHOWCASE_HOME_VERIFICATION_FAILED');
      ctx.lifecycleResumeAllowed = false;
    }
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
    for (const product of ctx.dataset.products) {
      const actual = await ctx.admin.request(`/api/v1/user/catalog/products/${encodeURIComponent(product.sku)}`);
      if (actual?.sku !== product.sku || !Array.isArray(actual.variants) || !actual.variants.some((variant) => variant.sku === product.sku)) throw new Error('SHOWCASE_CATALOG_VERIFICATION_FAILED');
      const variant = actual.variants.find((item) => item.sku === product.sku);
      if (!validOrderId(actual.id) || !validOrderId(variant?.id) || typeof actual.name !== 'string' || !actual.name.trim()) throw new Error('SHOWCASE_CATALOG_VERIFICATION_FAILED');
      ctx.products.push(Object.freeze({ productId: String(actual.id), variantId: String(variant.id), sku: product.sku, name: actual.name }));
      const identity = ctx.createdProducts.get(product.sku);
      if (identity) requireCreatedProduct(actual, product, ctx.orderReceipt !== null && product === ctx.journey.primary ? 1 : 0, identity, ctx.richExperience);
    }
    const cart = await ctx.customer.request('/api/v1/customer/cart');
    if (!Array.isArray(cart?.lines) || JSON.stringify(cart) !== JSON.stringify(ctx.cart)) throw new Error('SHOWCASE_CART_VERIFICATION_FAILED');
    if (ctx.orderId != null) {
      const order = await ctx.customer.request(`/api/v1/customer/orders/${encodeURIComponent(ctx.orderId)}`);
      requireOrderIdentity(order, ctx.orderId, ctx.journey);
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

function requireOrderIdentity(order, id, journey) {
  if (!validOrderId(id) || String(order?.id) !== String(id) || !Array.isArray(order.lines) || order.lines.length !== 1 ||
      order.lines[0]?.sku !== journey.primary.sku || order.lines[0].quantity !== 1) throw new Error('SHOWCASE_ORDER_VERIFICATION_FAILED');
}

function requireRealReceipt(receipt, expectedProductCount) {
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const unique = values => new Set(values).size === values.length;
  const products = receipt.products;
  if (!Number.isSafeInteger(receipt.customerId) || receipt.customerId <= 0 ||
      !Number.isSafeInteger(receipt.offerId) || receipt.offerId <= 0 ||
      !validOrderId(receipt.pendingOrderId) || !validOrderId(receipt.addressId) ||
      !text(receipt.addressStreet) || !text(receipt.homeTitle) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receipt.customerEmail) ||
      !text(receipt.cart.revision) || receipt.cart.skus.length === 0 || !unique(receipt.cart.skus) ||
      products.length !== expectedProductCount || !unique(products.map(product => product.productId)) ||
      !unique(products.map(product => product.variantId)) || !unique(products.map(product => product.sku)) ||
      products.some(product => !validOrderId(product.productId) || !validOrderId(product.variantId) ||
        !text(product.name) || !text(product.sku) || product.sku.startsWith('ROUTE-')) ||
      receipt.cart.skus.some(sku => !products.some(product => product.sku === sku))) {
    throw new Error('SHOWCASE_REAL_RECEIPT_INVALID');
  }
}

export class ShowcaseLoader {
  constructor(config, onProgress = (stage) => console.log(`[showcase] ${stage.label}: OK`), dataset = DEFAULT_SHOWCASE_DATASET) {
    this.context = new ShowcaseContext(config, dataset);
    this.onProgress = onProgress;
  }
  async run() {
    for (const current of STEPS) {
      if (ShowcaseStage.fromWire(current.stage.wire) === ShowcaseStage.Unknown) throw new Error('SHOWCASE_UNKNOWN_STAGE');
      await current.run(this.context);
      this.onProgress(current.stage);
    }
    const ctx = this.context;
    const summary = { products: ctx.dataset.products.length, pendingOrderCreated: ctx.orderReceipt !== null };
    if (!ctx.config.requireRealRouteReceipt) return Object.freeze(summary);
    const receipt = Object.freeze({ schemaVersion: 1, scenarioPrefix: ctx.config.scenarioPrefix,
      products: Object.freeze(ctx.products), customerId: ctx.customerId, customerEmail: ctx.config.customerEmail,
      addressId: ctx.addressId, addressRevision: ctx.addressRevision, addressStreet: ctx.addressStreet,
      pendingOrderId: ctx.orderId === null ? null : String(ctx.orderId), offerId: ctx.offerId,
      homeTitle: ctx.home.sections.find(section => section.active && typeof section.content?.title === 'string')?.content.title ?? null,
      cart: Object.freeze({ revision: ctx.cart.revision, skus: Object.freeze(ctx.cart.lines.map(line => line.sku)) }),
      scenarios: Object.freeze(ShowcaseReceiptScenario.values.map(scenario => Object.freeze({ scenario: scenario.wire, evidence: ShowcaseReceiptEvidence.RealBackend.wire }))),
    });
    requireRealReceipt(receipt, ctx.dataset.products.length);
    return Object.freeze({ ...summary, receipt });
  }
}

async function main() {
  const dataset = await readShowcaseDataset(process.env.STORECORE_SHOWCASE_DATASET_FILE);
  const result = await new ShowcaseLoader(ShowcaseConfig.fromEnvironment(), undefined, dataset).run();
  console.log(`[showcase] completed: ${result.products} products; pending order created: ${result.pendingOrderCreated}`);
}

const invokedAs = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedAs === import.meta.url) main().catch((error) => { console.error(`[showcase] failed: ${error.message}`); process.exitCode = 1; });
