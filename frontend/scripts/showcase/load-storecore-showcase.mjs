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
  static Verification = new ShowcaseStage(CONSTRUCTION_TOKEN, 'VERIFICATION', 'Verification');
  static Unknown = new ShowcaseStage(CONSTRUCTION_TOKEN, 'UNKNOWN', 'Unknown');
  static values = Object.freeze([
    ShowcaseStage.Preflight, ShowcaseStage.AdminAuthentication, ShowcaseStage.ExternalSafety,
    ShowcaseStage.CapabilityActivation, ShowcaseStage.CommercialContent,
    ShowcaseStage.CustomerIdentity, ShowcaseStage.CustomerAddress, ShowcaseStage.PendingOrder,
    ShowcaseStage.Cart, ShowcaseStage.Verification,
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
  static Unknown = new ShowcaseCapability(CAPABILITY_CONSTRUCTION_TOKEN, 'unknown');
  static values = Object.freeze([
    ShowcaseCapability.Storefront, ShowcaseCapability.Catalog, ShowcaseCapability.ProfileContent,
    ShowcaseCapability.PaymentsMp, ShowcaseCapability.ManualFulfillment,
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

  async request(path, { method = 'GET', body, expected = [200], csrf = false, envelope = true } = {}) {
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
    if (payload !== null && (typeof payload !== 'object' || payload.code !== response.status)) throw new Error(`INVALID_BASE_RESPONSE:${method}:${path}`);
    return payload?.data ?? null;
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
  }
}

function step(stage, run) { return Object.freeze({ stage, run }); }

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
  step(ShowcaseStage.ExternalSafety, async (ctx) => {
    const safety = await ctx.admin.request('/api/v1/user/showcase-safety');
    if (ShowcaseAdapterMode.fromWire(safety?.mpOrdersAdapter) !== ShowcaseAdapterMode.Unconfigured || safety?.externalCheckoutDisabled !== true) {
      throw new Error('SHOWCASE_EXTERNAL_ADAPTER_CONFIGURED');
    }
  }),
  step(ShowcaseStage.CapabilityActivation, async (ctx) => {
    const modules = await ctx.admin.request('/api/v1/user/capabilities');
    const byModule = new Map(modules.map((module) => [ShowcaseCapability.fromWire(module.module), module]));
    for (const capability of ShowcaseCapability.values) {
      const module = byModule.get(capability);
      if (!module || !Number.isSafeInteger(module.configVersion)) throw new Error(`SHOWCASE_CAPABILITY_MISSING:${capability.wire}`);
      const state = ShowcaseCapabilityState.fromWire(module.state);
      if (state === ShowcaseCapabilityState.Active) continue;
      if (state !== ShowcaseCapabilityState.Disabled) throw new Error(`SHOWCASE_CAPABILITY_STATE_UNSUPPORTED:${capability.wire}`);
      await ctx.admin.request(`/api/v1/user/capabilities/${capability.wire}/state`, {
        method: 'POST', csrf: true,
        body: { state: ShowcaseCapabilityState.Active.wire, expectedConfigVersion: module.configVersion, reason: 'LOCAL_SHOWCASE_ACTIVATION' },
      });
    }
  }),
  step(ShowcaseStage.CommercialContent, async (ctx) => {
    await ctx.admin.request('/api/v1/user/content/home', { method: 'PUT', csrf: true, body: { title: 'Todo para tu taller, en un solo lugar', body: 'Herramientas seleccionadas, stock visible y compra simple.' } });
    for (const product of PRODUCTS) {
      const existing = await ctx.admin.request(`/api/v1/catalog/products/${encodeURIComponent(product.sku)}`, { expected: [200, 404] });
      if (existing !== null) continue;
      await ctx.admin.request(`/api/v1/user/catalog/products/${encodeURIComponent(product.sku)}`, {
        method: 'PUT', csrf: true,
        body: { sku: product.sku, name: product.name, description: product.description, brand: product.brand, category: product.category, images: [product.image], price: { base: product.price }, active: true, variants: [{ sku: product.sku, name: product.name, availableQuantity: product.stock, stockAdjustmentReason: 'LOCAL_SHOWCASE_RECONCILIATION' }] },
      });
    }
  }),
  step(ShowcaseStage.CustomerIdentity, async (ctx) => {
    const principal = await ctx.customer.request('/api/v1/customer/auth/login', {
      method: 'POST', expected: [200, 401],
      body: { email: ctx.config.customerEmail, password: ctx.config.customerPassword },
    });
    if (principal !== null) return;
    await ctx.customer.request('/api/v1/customer/auth/register', {
      method: 'POST', expected: [201],
      body: { email: ctx.config.customerEmail, password: ctx.config.customerPassword, firstName: 'Cliente', lastName: 'Showcase' },
    });
  }),
  step(ShowcaseStage.CustomerAddress, async (ctx) => {
    const addresses = await ctx.customer.request('/api/v1/customer/me/addresses');
    const existing = addresses.find((address) => address.street === SHOWCASE_ADDRESS.street && address.number === SHOWCASE_ADDRESS.number);
    const address = existing === undefined
      ? await ctx.customer.request('/api/v1/customer/me/addresses', { method: 'POST', csrf: true, body: SHOWCASE_ADDRESS })
      : addressMatches(existing, SHOWCASE_ADDRESS)
        ? existing
        : await ctx.customer.request(`/api/v1/customer/me/addresses/${encodeURIComponent(String(existing.id))}`, { method: 'PUT', csrf: true, body: SHOWCASE_ADDRESS });
    ctx.addressId = String(address.id);
  }),
  step(ShowcaseStage.PendingOrder, async (ctx) => {
    if (!ctx.config.includePendingOrder) return;
    const orders = await ctx.customer.request('/api/v1/customer/orders');
    const existing = orders.find((order) => Array.isArray(order?.lines) && order.lines.some((line) => line?.sku === PRODUCTS[0].sku));
    if (existing) {
      requirePendingOrder(existing);
      return;
    }
    await ctx.customer.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: PRODUCTS[0].sku, quantity: 1 } });
    const receipt = await ctx.customer.request('/api/v1/customer/checkout', { method: 'POST', csrf: true, body: { idempotencyKey: '2f5570dc-70b8-4f1c-a217-71f82f6ebc45', addressId: ctx.addressId, currency: 'ARS' } });
    requirePendingOrder(receipt);
    ctx.orderReceipt = receipt;
  }),
  step(ShowcaseStage.Cart, async (ctx) => {
    await ctx.customer.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: PRODUCTS[1].sku, quantity: 1 } });
    await ctx.customer.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: PRODUCTS[2].sku, quantity: 2 } });
  }),
  step(ShowcaseStage.Verification, async (ctx) => {
    const home = await ctx.admin.request('/api/v1/content/home');
    if (home?.title !== 'Todo para tu taller, en un solo lugar') throw new Error('SHOWCASE_HOME_VERIFICATION_FAILED');
    const catalog = await ctx.admin.request('/api/v1/catalog');
    const actual = new Set(catalog.map((item) => item.sku));
    if (PRODUCTS.some((product) => !actual.has(product.sku))) throw new Error('SHOWCASE_CATALOG_VERIFICATION_FAILED');
    for (const product of PRODUCTS) await ctx.admin.request(`/api/v1/catalog/products/${encodeURIComponent(product.sku)}`);
    const cart = await ctx.customer.request('/api/v1/customer/cart');
    if (!Array.isArray(cart?.lines) || cart.lines.length < 2) throw new Error('SHOWCASE_CART_VERIFICATION_FAILED');
  }),
]);

function requirePendingOrder(order) {
  if (ShowcasePaymentStatus.fromWire(order?.paymentStatus) !== ShowcasePaymentStatus.Pending ||
      ShowcaseOrderStatus.fromWire(order?.orderStatus) !== ShowcaseOrderStatus.PendingPayment) {
    throw new Error('SHOWCASE_CHECKOUT_MUST_REMAIN_PENDING');
  }
}

export function addressMatches(actual, expected) {
  return actual?.street === expected.street &&
    actual?.number === expected.number &&
    actual?.city === expected.city &&
    actual?.province === expected.province &&
    actual?.postalCode === expected.postalCode &&
    actual?.isDefault === expected.isDefault;
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
