import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const CONSTRUCTION_TOKEN = Symbol('ShowcaseStage');

export class ShowcaseStage {
  static Preflight = new ShowcaseStage(CONSTRUCTION_TOKEN, 'PREFLIGHT', 'Preflight');
  static AdminAuthentication = new ShowcaseStage(CONSTRUCTION_TOKEN, 'ADMIN_AUTHENTICATION', 'Admin authentication');
  static CommercialContent = new ShowcaseStage(CONSTRUCTION_TOKEN, 'COMMERCIAL_CONTENT', 'Commercial content');
  static CustomerIdentity = new ShowcaseStage(CONSTRUCTION_TOKEN, 'CUSTOMER_IDENTITY', 'Customer identity');
  static CustomerAddress = new ShowcaseStage(CONSTRUCTION_TOKEN, 'CUSTOMER_ADDRESS', 'Customer address');
  static PendingOrder = new ShowcaseStage(CONSTRUCTION_TOKEN, 'PENDING_ORDER', 'Pending order');
  static Cart = new ShowcaseStage(CONSTRUCTION_TOKEN, 'CART', 'Cart');
  static Verification = new ShowcaseStage(CONSTRUCTION_TOKEN, 'VERIFICATION', 'Verification');
  static Unknown = new ShowcaseStage(CONSTRUCTION_TOKEN, 'UNKNOWN', 'Unknown');
  static values = Object.freeze([
    ShowcaseStage.Preflight, ShowcaseStage.AdminAuthentication, ShowcaseStage.CommercialContent,
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

const PRODUCTS = Object.freeze([
  Object.freeze({ sku: 'SHOW-TALADRO-18V', name: 'Taladro percutor 18V', description: 'Taladro inalámbrico para taller con dos baterías.', brand: 'Showcase Tools', category: 'Herramientas eléctricas', image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c', price: 189900, stock: 12 }),
  Object.freeze({ sku: 'SHOW-AMOLADORA-850', name: 'Amoladora angular 850W', description: 'Amoladora compacta con protector regulable.', brand: 'Showcase Tools', category: 'Herramientas eléctricas', image: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8', price: 87900, stock: 8 }),
  Object.freeze({ sku: 'SHOW-SET-MANUAL', name: 'Set de herramientas 108 piezas', description: 'Kit organizado para mantenimiento general.', brand: 'Showcase Pro', category: 'Herramientas manuales', image: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc', price: 149500, stock: 15 }),
]);

export class ShowcaseConfig {
  constructor({ baseUrl, origin, adminEmail, adminPassword, customerEmail, customerPassword, includePendingOrder }) {
    const target = new URL(required(baseUrl, 'STORECORE_SHOWCASE_BASE_URL'));
    const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (target.protocol !== 'http:' || !allowedHosts.has(target.hostname)) throw new Error('SHOWCASE_LOOPBACK_TARGET_REQUIRED');
    const browserOrigin = new URL(required(origin, 'STORECORE_SHOWCASE_ORIGIN'));
    if (!allowedHosts.has(browserOrigin.hostname)) throw new Error('SHOWCASE_LOOPBACK_ORIGIN_REQUIRED');
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
    if (!Array.isArray(principal?.roles) || !principal.roles.includes('ADMIN')) throw new Error('SHOWCASE_ADMIN_ROLE_REQUIRED');
  }),
  step(ShowcaseStage.CommercialContent, async (ctx) => {
    await ctx.admin.request('/api/v1/user/content/home', { method: 'PUT', csrf: true, body: { title: 'Todo para tu taller, en un solo lugar', body: 'Herramientas seleccionadas, stock visible y compra simple.' } });
    for (const product of PRODUCTS) {
      await ctx.admin.request(`/api/v1/user/catalog/products/${encodeURIComponent(product.sku)}`, {
        method: 'PUT', csrf: true,
        body: { sku: product.sku, name: product.name, description: product.description, brand: product.brand, category: product.category, images: [product.image], price: { base: product.price }, active: true, variants: [{ sku: product.sku, name: product.name, availableQuantity: product.stock, stockAdjustmentReason: 'LOCAL_SHOWCASE_RECONCILIATION' }] },
      });
    }
  }),
  step(ShowcaseStage.CustomerIdentity, async (ctx) => {
    const registered = await ctx.customer.request('/api/v1/customer/auth/register', { method: 'POST', expected: [201, 409], body: { email: ctx.config.customerEmail, password: ctx.config.customerPassword, firstName: 'Cliente', lastName: 'Showcase' } });
    if (registered === null) {
      await ctx.customer.request('/api/v1/customer/auth/login', { method: 'POST', body: { email: ctx.config.customerEmail, password: ctx.config.customerPassword } });
    }
  }),
  step(ShowcaseStage.CustomerAddress, async (ctx) => {
    const addresses = await ctx.customer.request('/api/v1/customer/me/addresses');
    const existing = addresses.find((address) => address.street === 'Avenida Siempre Viva' && address.number === '2209');
    const address = existing ?? await ctx.customer.request('/api/v1/customer/me/addresses', { method: 'POST', csrf: true, body: { street: 'Avenida Siempre Viva', number: '2209', city: 'Córdoba', province: 'Córdoba', postalCode: '5000', isDefault: true } });
    ctx.addressId = String(address.id);
  }),
  step(ShowcaseStage.PendingOrder, async (ctx) => {
    if (!ctx.config.includePendingOrder) return;
    const orders = await ctx.customer.request('/api/v1/customer/orders');
    if (orders.length) return;
    await ctx.customer.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: PRODUCTS[0].sku, quantity: 1 } });
    const receipt = await ctx.customer.request('/api/v1/customer/checkout', { method: 'POST', csrf: true, body: { idempotencyKey: '2f5570dc-70b8-4f1c-a217-71f82f6ebc45', addressId: ctx.addressId, currency: 'ARS' } });
    if (receipt.paymentStatus !== 'PENDING' || receipt.orderStatus !== 'PENDING_PAYMENT') throw new Error('SHOWCASE_CHECKOUT_MUST_REMAIN_PENDING');
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
