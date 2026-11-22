import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HttpSession } from './load-storecore-showcase.mjs';
import { readShowcaseDataset } from './read-showcase-dataset.mjs';
import { PresentationCapabilityModule, PresentationCapabilityState, PresentationCurrency, PresentationDeliveryMode,
  PresentationHealthStatus, PresentationOrderStatus, PresentationPricePolicyState, PresentationPricePolicyTransition,
  PresentationPriceScope, PresentationPriceWriter, PresentationRunState, presentationVolumeDataset } from './presentation-volume-dataset.mjs';

const required = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}_REQUIRED`);
  return value.trim();
};
const validId = value => /^\d+$/.test(String(value));

export class PresentationVolumeConfig {
  constructor(raw) {
    const base = new URL(required(raw.baseUrl, 'STORECORE_PRESENTATION_BASE_URL'));
    const origin = new URL(required(raw.origin, 'STORECORE_PRESENTATION_ORIGIN'));
    const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (base.protocol !== 'http:' || !hosts.has(base.hostname)) throw new Error('STORECORE_PRESENTATION_LOOPBACK_TARGET_REQUIRED');
    if (!['http:', 'https:'].includes(origin.protocol) || !hosts.has(origin.hostname)) throw new Error('STORECORE_PRESENTATION_LOOPBACK_ORIGIN_REQUIRED');
    this.baseUrl = base.href.replace(/\/$/, ''); this.origin = origin.origin;
    this.adminEmail = required(raw.adminEmail, 'STORECORE_PRESENTATION_ADMIN_EMAIL');
    this.adminPassword = required(raw.adminPassword, 'STORECORE_PRESENTATION_ADMIN_PASSWORD');
    this.journalPath = resolve(required(raw.journalPath, 'STORECORE_PRESENTATION_JOURNAL_PATH'));
    this.receiptPath = resolve(required(raw.receiptPath, 'STORECORE_PRESENTATION_RECEIPT_PATH'));
    Object.freeze(this);
  }
  static fromEnvironment(env = process.env) {
    return new PresentationVolumeConfig({
      baseUrl: env.STORECORE_PRESENTATION_BASE_URL ?? env.STORECORE_SHOWCASE_BASE_URL,
      origin: env.STORECORE_PRESENTATION_ORIGIN ?? env.STORECORE_SHOWCASE_ORIGIN,
      adminEmail: env.STORECORE_PRESENTATION_ADMIN_EMAIL ?? env.STORECORE_SHOWCASE_ADMIN_EMAIL,
      adminPassword: env.STORECORE_PRESENTATION_ADMIN_PASSWORD ?? env.STORECORE_SHOWCASE_ADMIN_PASSWORD,
      journalPath: env.STORECORE_PRESENTATION_JOURNAL_PATH,
      receiptPath: env.STORECORE_PRESENTATION_RECEIPT_PATH,
    });
  }
}

class PresentationJournal {
  constructor(path, digest) {
    this.path = path; this.digest = digest;
    this.value = { schemaVersion: 1, namespace: 'storecore-presentation-volume-v1', datasetDigest: digest,
      createdAt: new Date().toISOString(), customers: {}, policies: {} };
  }
  async load() {
    try { this.value = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const valid = this.value?.schemaVersion === 1 && this.value.namespace === 'storecore-presentation-volume-v1'
      && this.value.datasetDigest === this.digest && Number.isFinite(Date.parse(this.value.createdAt))
      && this.value.customers && !Array.isArray(this.value.customers)
      && this.value.policies && !Array.isArray(this.value.policies);
    if (!valid) throw new Error('PRESENTATION_JOURNAL_INVALID');
    return this;
  }
  customer(key) { return this.value.customers[key] ?? null; }
  policy(key) { return this.value.policies[key] ?? null; }
  async save(section, key, value) {
    this.value[section][key] = value;
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
  }
}

class PresentationStep {
  constructor(name, execute) { this.name = name; this.execute = execute; Object.freeze(this); }
}

function exactAddress(actual, expected) {
  return actual?.street === expected.street && actual?.number === expected.number && actual?.city === expected.city
    && actual?.province === expected.province && actual?.postalCode === expected.postalCode && actual?.isDefault === expected.isDefault;
}
function exactCart(cart, sku) {
  return Array.isArray(cart?.lines) && cart.lines.length === 1 && cart.lines[0]?.sku === sku && cart.lines[0]?.quantity === 1;
}
function requirePage(page, code) {
  if (!page || !Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < page.items.length) throw new Error(code);
  return page;
}

export class PresentationVolumeLoader {
  constructor(config, rawDataset, dependencies = {}) {
    this.config = config;
    this.dataset = dependencies.dataset ?? presentationVolumeDataset(rawDataset.products);
    this.admin = dependencies.admin ?? new HttpSession(config);
    this.journal = dependencies.journal ?? new PresentationJournal(config.journalPath, this.dataset.digest);
    this.steps = Object.freeze([
      new PresentationStep('preflight', context => context.preflight()),
      new PresentationStep('customers', context => context.seedCustomers()),
      new PresentationStep('policies', context => context.seedPolicies()),
      new PresentationStep('verify', context => context.verify()),
    ]);
  }

  async run() {
    await this.journal.load();
    for (const step of this.steps) await step.execute(this);
    const receipt = await this.receipt();
    await mkdir(dirname(this.config.receiptPath), { recursive: true });
    await writeFile(this.config.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return receipt;
  }

  async preflight() {
    const health = await this.admin.request('/api/v1/health', { envelope: false });
    if (PresentationHealthStatus.fromWire(health?.status) !== PresentationHealthStatus.Up) throw new Error('PRESENTATION_BACKEND_NOT_READY');
    await this.admin.request('/api/v1/internal/auth/login', { method: 'POST', body: { email: this.config.adminEmail, password: this.config.adminPassword } });
    const capabilities = await this.admin.request('/api/v1/user/capabilities');
    for (const module of PresentationCapabilityModule.values) {
      const capability = capabilities.find(row => PresentationCapabilityModule.fromWire(row?.module) === module);
      if (PresentationCapabilityState.fromWire(capability?.state) !== PresentationCapabilityState.Active) throw new Error(`PRESENTATION_CAPABILITY_NOT_ACTIVE:${module.wire}`);
    }
  }

  async seedCustomers() {
    for (const fixture of this.dataset.customers) await this.seedCustomer(fixture);
  }

  assertCustomerIntent(fixture, saved) {
    if (!saved || saved.email !== fixture.email || saved.orderSku !== fixture.orderSku || saved.cartSku !== fixture.cartSku
      || saved.idempotencyKey !== fixture.idempotencyKey || PresentationDeliveryMode.fromWire(saved.deliveryMode) !== fixture.deliveryMode) {
      throw new Error(`PRESENTATION_CUSTOMER_JOURNAL_DRIFT:${fixture.key}`);
    }
  }

  async seedCustomer(fixture) {
    let saved = this.journal.customer(fixture.key);
    const session = new HttpSession(this.config);
    let principal = await session.request('/api/v1/customer/auth/login', { method: 'POST', expected: [200, 401], body: { email: fixture.email, password: fixture.password } });
    if (!saved) {
      if (principal !== null) throw new Error(`PRESENTATION_UNOWNED_CUSTOMER_EXISTS:${fixture.key}`);
      saved = { key: fixture.key, email: fixture.email, orderSku: fixture.orderSku, cartSku: fixture.cartSku,
        idempotencyKey: fixture.idempotencyKey, deliveryMode: fixture.deliveryMode.wire, state: PresentationRunState.Create.wire };
      await this.journal.save('customers', fixture.key, saved);
    }
    this.assertCustomerIntent(fixture, saved);
    if (principal === null) principal = await session.request('/api/v1/customer/auth/register', { method: 'POST', expected: [201], body: {
      email: fixture.email, password: fixture.password, firstName: fixture.firstName, lastName: fixture.lastName,
    } });
    if (!validId(principal?.id)) throw new Error(`PRESENTATION_CUSTOMER_INVALID:${fixture.key}`);
    if (saved.customerId && String(principal.id) !== saved.customerId) throw new Error(`PRESENTATION_CUSTOMER_ID_DRIFT:${fixture.key}`);
    saved = { ...saved, customerId: String(principal.id) };
    await this.journal.save('customers', fixture.key, saved);

    const addresses = await session.request('/api/v1/customer/me/addresses');
    if (!Array.isArray(addresses)) throw new Error(`PRESENTATION_ADDRESS_INVALID:${fixture.key}`);
    for (const expected of fixture.addresses) {
      if (addresses.some(actual => exactAddress(actual, expected))) continue;
      addresses.push(await session.request('/api/v1/customer/me/addresses', { method: 'POST', csrf: true, body: expected }));
    }
    if (addresses.length !== fixture.addresses.length || fixture.addresses.some(expected => !addresses.some(actual => exactAddress(actual, expected)))) {
      throw new Error(`PRESENTATION_ADDRESS_DRIFT:${fixture.key}`);
    }
    const defaultAddress = addresses.find(row => row?.isDefault);
    if (!validId(defaultAddress?.id) || typeof defaultAddress.revision !== 'string') throw new Error(`PRESENTATION_ADDRESS_INVALID:${fixture.key}`);

    if (!saved.checkoutCommand) {
      let cart = await session.request('/api/v1/customer/cart');
      if (cart?.lines?.length === 0) {
        await session.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: fixture.orderSku, quantity: 1 } });
        cart = await session.request('/api/v1/customer/cart');
      }
      if (!exactCart(cart, fixture.orderSku)) throw new Error(`PRESENTATION_CHECKOUT_CART_DRIFT:${fixture.key}`);
      const quote = cart.deliveryOptions?.find(row => PresentationDeliveryMode.fromWire(row?.mode) === fixture.deliveryMode);
      if (!quote || !Number.isSafeInteger(quote.configurationVersion) || PresentationCurrency.fromWire(quote.currency) !== PresentationCurrency.Ars) throw new Error(`PRESENTATION_DELIVERY_INVALID:${fixture.key}`);
      saved = { ...saved, checkoutCommand: { idempotencyKey: fixture.idempotencyKey,
        addressId: fixture.deliveryMode === PresentationDeliveryMode.LocalDelivery ? String(defaultAddress.id) : null,
        addressRevision: fixture.deliveryMode === PresentationDeliveryMode.LocalDelivery ? defaultAddress.revision : null,
        cartRevision: cart.revision, currency: PresentationCurrency.Ars.wire, deliveryMode: fixture.deliveryMode.wire,
        deliveryConfigurationVersion: quote.configurationVersion } };
      await this.journal.save('customers', fixture.key, saved);
    }
    const checkout = await session.request('/api/v1/customer/checkout', { method: 'POST', csrf: true, body: saved.checkoutCommand });
    if (!validId(checkout?.orderId) || PresentationOrderStatus.fromWire(checkout.orderStatus) !== PresentationOrderStatus.PendingPayment) {
      throw new Error(`PRESENTATION_CHECKOUT_INVALID:${fixture.key}`);
    }
    if (saved.orderId && String(checkout.orderId) !== saved.orderId) throw new Error(`PRESENTATION_ORDER_ID_DRIFT:${fixture.key}`);
    saved = { ...saved, orderId: String(checkout.orderId), state: PresentationRunState.Replay.wire };
    await this.journal.save('customers', fixture.key, saved);

    let cart = await session.request('/api/v1/customer/cart');
    if (cart?.lines?.length === 0) {
      await session.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: fixture.cartSku, quantity: 1 } });
      cart = await session.request('/api/v1/customer/cart');
    }
    if (!exactCart(cart, fixture.cartSku)) throw new Error(`PRESENTATION_CART_DRIFT:${fixture.key}`);
    const favorites = await session.request('/api/v1/customer/favorites');
    if (!Array.isArray(favorites)) throw new Error(`PRESENTATION_FAVORITES_INVALID:${fixture.key}`);
    for (const sku of fixture.favoriteSkus) if (!favorites.some(row => row?.sku === sku)) {
      await session.request(`/api/v1/customer/favorites/${encodeURIComponent(sku)}`, { method: 'PUT', csrf: true });
    }
    const finalFavorites = await session.request('/api/v1/customer/favorites');
    if (finalFavorites.length !== fixture.favoriteSkus.length || fixture.favoriteSkus.some(sku => !finalFavorites.some(row => row?.sku === sku))) {
      throw new Error(`PRESENTATION_FAVORITES_DRIFT:${fixture.key}`);
    }
  }

  async seedPolicies() {
    const now = Date.now();
    for (const fixture of this.dataset.policies) {
      let saved = this.journal.policy(fixture.key);
      if (!saved) {
        const command = { listingSku: fixture.sku, currency: PresentationCurrency.Ars.wire, priceScope: PresentationPriceScope.Default.wire, desiredPrice: fixture.desiredPrice,
          effectivePromoPrice: null, validFrom: new Date(now - 86_400_000).toISOString(),
          validTo: new Date(now + 90 * 86_400_000).toISOString(), writer: PresentationPriceWriter.Manual.wire };
        saved = { key: fixture.key, sku: fixture.sku, target: fixture.target.wire, command };
        await this.journal.save('policies', fixture.key, saved);
      }
      if (saved.sku !== fixture.sku || PresentationPricePolicyState.fromWire(saved.target) !== fixture.target || !saved.command) {
        throw new Error(`PRESENTATION_POLICY_JOURNAL_DRIFT:${fixture.key}`);
      }
      if (!saved.policyId) {
        const recovered = await this.findPoliciesByCommand(saved.command);
        if (recovered.length > 1) throw new Error(`PRESENTATION_POLICY_RECOVERY_AMBIGUOUS:${fixture.key}`);
        const policy = recovered[0] ?? await this.admin.request('/api/v1/user/promos', { method: 'POST', csrf: true, body: saved.command });
        if (!validId(policy?.id) || PresentationPricePolicyState.fromWire(policy.status) === PresentationPricePolicyState.Unknown) throw new Error(`PRESENTATION_POLICY_CREATE_FAILED:${fixture.key}`);
        saved = { ...saved, policyId: String(policy.id) };
        await this.journal.save('policies', fixture.key, saved);
      }
      let policy = await this.findPolicy(saved.policyId);
      if (fixture.target !== PresentationPricePolicyState.Draft && PresentationPricePolicyState.fromWire(policy.status) === PresentationPricePolicyState.Draft) {
        policy = await this.transitionPolicy(saved.policyId, PresentationPricePolicyTransition.Activate);
      }
      if (fixture.target === PresentationPricePolicyState.Paused && PresentationPricePolicyState.fromWire(policy.status) === PresentationPricePolicyState.Active) {
        policy = await this.transitionPolicy(saved.policyId, PresentationPricePolicyTransition.Pause);
      }
      if (PresentationPricePolicyState.fromWire(policy.status) !== fixture.target || policy.listingSku !== fixture.sku) throw new Error(`PRESENTATION_POLICY_DRIFT:${fixture.key}`);
    }
  }

  async transitionPolicy(id, transition) {
    if (PresentationPricePolicyTransition.fromWire(transition?.wire) === PresentationPricePolicyTransition.Unknown) throw new Error('PRESENTATION_POLICY_TRANSITION_INVALID');
    return this.admin.request(`/api/v1/user/promos/${id}/state`, { method: 'POST', csrf: true, body: { transition: transition.wire } });
  }

  async findPolicy(id) {
    for (let page = 0; page < 200; page += 1) {
      const result = requirePage(await this.admin.request(`/api/v1/user/promos?page=${page}&size=50`), 'PRESENTATION_POLICY_PAGE_INVALID');
      const policy = result.items.find(row => String(row?.id) === String(id));
      if (policy) return policy;
      if ((page + 1) * 50 >= result.total) throw new Error(`PRESENTATION_POLICY_NOT_FOUND:${id}`);
    }
    throw new Error('PRESENTATION_POLICY_PAGE_LIMIT');
  }

  async findPoliciesByCommand(command) {
    const found = [];
    for (let page = 0; page < 200; page += 1) {
      const result = requirePage(await this.admin.request(`/api/v1/user/promos?page=${page}&size=50`), 'PRESENTATION_POLICY_PAGE_INVALID');
      found.push(...result.items.filter(policy => this.policyMatchesCommand(policy, command)));
      if ((page + 1) * 50 >= result.total) return found;
    }
    throw new Error('PRESENTATION_POLICY_PAGE_LIMIT');
  }

  policyMatchesCommand(policy, command) {
    return policy?.listingSku === command.listingSku
      && PresentationCurrency.fromWire(policy.currency) === PresentationCurrency.fromWire(command.currency)
      && PresentationPriceScope.fromWire(policy.priceScope) === PresentationPriceScope.fromWire(command.priceScope)
      && policy.desiredPrice === command.desiredPrice && policy.effectivePromoPrice === command.effectivePromoPrice
      && Date.parse(policy.validFrom) === Date.parse(command.validFrom) && Date.parse(policy.validTo) === Date.parse(command.validTo)
      && PresentationPriceWriter.fromWire(policy.writer) === PresentationPriceWriter.fromWire(command.writer);
  }

  async verify() {
    for (const fixture of this.dataset.customers) {
      const saved = this.journal.customer(fixture.key); this.assertCustomerIntent(fixture, saved);
      if (!validId(saved.customerId) || !validId(saved.orderId) || PresentationRunState.fromWire(saved.state) !== PresentationRunState.Replay) throw new Error(`PRESENTATION_CUSTOMER_INCOMPLETE:${fixture.key}`);
      const session = new HttpSession(this.config);
      await session.request('/api/v1/customer/auth/login', { method: 'POST', body: { email: fixture.email, password: fixture.password } });
      const order = await session.request(`/api/v1/customer/orders/${saved.orderId}`);
      if (String(order?.id) !== saved.orderId || PresentationOrderStatus.fromWire(order.orderStatus) !== PresentationOrderStatus.PendingPayment
        || !order.lines?.some(line => line?.sku === fixture.orderSku)) throw new Error(`PRESENTATION_ORDER_READBACK_FAILED:${fixture.key}`);
      if (!exactCart(await session.request('/api/v1/customer/cart'), fixture.cartSku)) throw new Error(`PRESENTATION_CART_READBACK_FAILED:${fixture.key}`);
    }
    for (const fixture of this.dataset.policies) {
      const saved = this.journal.policy(fixture.key);
      if (!validId(saved?.policyId) || PresentationPricePolicyState.fromWire((await this.findPolicy(saved.policyId)).status) !== fixture.target) throw new Error(`PRESENTATION_POLICY_READBACK_FAILED:${fixture.key}`);
    }
    const orders = requirePage(await this.admin.request('/api/v1/user/orders?page=0&size=50'), 'PRESENTATION_ORDER_PAGE_INVALID');
    const owned = new Set(this.dataset.customers.map(fixture => this.journal.customer(fixture.key).orderId));
    if ([...owned].some(id => !orders.items.some(order => String(order?.id) === id))) throw new Error('PRESENTATION_ADMIN_ORDER_READBACK_FAILED');
  }

  async receipt() {
    const body = { schemaVersion: 1, namespace: this.dataset.namespace, evidence: 'REAL_BACKEND_SYNTHETIC_PRESENTATION_DATA',
      generatedAt: this.journal.value.createdAt, datasetDigest: this.dataset.digest,
      totals: { customers: this.dataset.customers.length, addresses: this.dataset.customers.reduce((sum, row) => sum + row.addresses.length, 0),
        favorites: this.dataset.customers.reduce((sum, row) => sum + row.favoriteSkus.length, 0), carts: this.dataset.customers.length,
        pendingOrders: this.dataset.customers.length, pricePolicies: this.dataset.policies.length },
      customers: this.dataset.customers.map(fixture => ({ key: fixture.key, customerId: this.journal.customer(fixture.key).customerId,
        orderId: this.journal.customer(fixture.key).orderId, email: fixture.email, orderSku: fixture.orderSku, cartSku: fixture.cartSku,
        deliveryMode: fixture.deliveryMode.wire })),
      policies: this.dataset.policies.map(fixture => ({ key: fixture.key, policyId: this.journal.policy(fixture.key).policyId,
        sku: fixture.sku, target: fixture.target.wire })),
    };
    return { ...body, digest: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
  }
}

async function main() {
  const raw = await readShowcaseDataset(process.env.STORECORE_SHOWCASE_DATASET_FILE);
  const result = await new PresentationVolumeLoader(PresentationVolumeConfig.fromEnvironment(), raw).run();
  console.log(JSON.stringify(result, null, 2));
}
const invokedAs = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedAs === import.meta.url) main().catch(error => { console.error(`[presentation-volume] failed: ${error.message}`); process.exitCode = 1; });
