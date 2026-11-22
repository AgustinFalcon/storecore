import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HttpSession } from './load-storecore-showcase.mjs';
import { commerceScenarioDataset, CommerceDeliveryMode, CommerceDispositionState, CommercePaymentStatus,
  CommerceReplayDecision, CommerceReturnTarget, CommerceRmaStatus, CommerceScenarioKind, CommerceShipmentCommand,
  CommerceShipmentStatus } from './commerce-scenario-dataset.mjs';
import { readShowcaseDataset } from './read-showcase-dataset.mjs';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const required = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}_REQUIRED`);
  return value.trim();
};
const loopbackUrl = (value, name) => {
  const parsed = new URL(required(value, name));
  if (parsed.protocol !== 'http:' || !loopbackHosts.has(parsed.hostname)) throw new Error(`${name}_LOOPBACK_REQUIRED`);
  return parsed.href.replace(/\/$/, '');
};
const loopbackOrigin = (value, name) => {
  const parsed = new URL(required(value, name));
  if (!['http:', 'https:'].includes(parsed.protocol) || !loopbackHosts.has(parsed.hostname)) throw new Error(`${name}_LOOPBACK_REQUIRED`);
  return parsed.origin;
};

export class CommerceScenarioConfig {
  constructor(raw) {
    this.baseUrl = loopbackUrl(raw.baseUrl, 'STORECORE_COMMERCE_BASE_URL');
    this.origin = loopbackOrigin(raw.origin, 'STORECORE_COMMERCE_ORIGIN');
    this.providerUrl = loopbackUrl(raw.providerUrl ?? 'http://127.0.0.1:4302', 'STORECORE_COMMERCE_PROVIDER_URL');
    this.adminEmail = required(raw.adminEmail, 'STORECORE_COMMERCE_ADMIN_EMAIL');
    this.adminPassword = required(raw.adminPassword, 'STORECORE_COMMERCE_ADMIN_PASSWORD');
    this.customerEmail = (raw.customerEmail?.trim() || 'showcase.commerce@storecore.invalid');
    if (!this.customerEmail.endsWith('.invalid')) throw new Error('STORECORE_COMMERCE_CUSTOMER_MUST_USE_INVALID_TLD');
    this.customerPassword = raw.customerPassword?.trim() || 'StoreCore-commerce-2026!';
    this.providerToken = required(raw.providerToken ?? 'cfe-local-provider-token', 'STORECORE_COMMERCE_PROVIDER_TOKEN');
    this.webhookSecret = required(raw.webhookSecret ?? 'cfe-local-webhook-secret', 'STORECORE_COMMERCE_WEBHOOK_SECRET');
    this.journalPath = resolve(required(raw.journalPath, 'STORECORE_COMMERCE_JOURNAL_PATH'));
    this.receiptPath = resolve(required(raw.receiptPath, 'STORECORE_COMMERCE_RECEIPT_PATH'));
    this.timeoutMs = Number(raw.timeoutMs ?? 30_000);
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 300_000) throw new Error('STORECORE_COMMERCE_TIMEOUT_INVALID');
    Object.freeze(this);
  }
  static fromEnvironment(env = process.env) {
    return new CommerceScenarioConfig({
      baseUrl: env.STORECORE_COMMERCE_BASE_URL ?? env.STORECORE_SHOWCASE_BASE_URL,
      origin: env.STORECORE_COMMERCE_ORIGIN ?? env.STORECORE_SHOWCASE_ORIGIN,
      providerUrl: env.STORECORE_COMMERCE_PROVIDER_URL,
      adminEmail: env.STORECORE_COMMERCE_ADMIN_EMAIL ?? env.STORECORE_SHOWCASE_ADMIN_EMAIL,
      adminPassword: env.STORECORE_COMMERCE_ADMIN_PASSWORD ?? env.STORECORE_SHOWCASE_ADMIN_PASSWORD,
      customerEmail: env.STORECORE_COMMERCE_CUSTOMER_EMAIL,
      customerPassword: env.STORECORE_COMMERCE_CUSTOMER_PASSWORD,
      providerToken: env.STORECORE_COMMERCE_PROVIDER_TOKEN,
      webhookSecret: env.STORECORE_COMMERCE_WEBHOOK_SECRET,
      journalPath: env.STORECORE_COMMERCE_JOURNAL_PATH,
      receiptPath: env.STORECORE_COMMERCE_RECEIPT_PATH,
      timeoutMs: env.STORECORE_COMMERCE_TIMEOUT_MS,
    });
  }
}

class CommerceJournal {
  constructor(path) { this.path = path; this.value = { schemaVersion: 1, namespace: 'ferreteria-falcon-commerce-v1', createdAt: new Date().toISOString(), scenarios: {} }; }
  async load() {
    try { this.value = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (this.value?.schemaVersion !== 1 || this.value.namespace !== 'ferreteria-falcon-commerce-v1' || !Number.isFinite(Date.parse(this.value.createdAt)) || !this.value.scenarios || Array.isArray(this.value.scenarios)) throw new Error('COMMERCE_JOURNAL_INVALID');
    return this;
  }
  scenario(key) { return this.value.scenarios[key] ?? null; }
  async save(key, value) {
    this.value.scenarios[key] = value;
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
  }
}

class ScenarioStep {
  constructor(name, execute) { this.name = name; this.execute = execute; Object.freeze(this); }
}

const shipmentCommand = new Map([
  [CommerceShipmentCommand.Preparing, 'PACKED'], [CommerceShipmentCommand.Shipped, 'SHIPPED'],
  [CommerceShipmentCommand.Delivered, 'DELIVERED'], [CommerceShipmentCommand.ReadyForPickup, 'READY_FOR_PICKUP'],
  [CommerceShipmentCommand.PickedUp, 'PICKED_UP'],
]);
const expectedPayment = (scenario) => scenario.kind === CommerceScenarioKind.PendingPayment ? CommercePaymentStatus.Pending : CommercePaymentStatus.Approved;
const expectedShipment = (scenario) => CommerceShipmentStatus.fromWire(scenario.shipmentPath.at(-1)?.wire ?? CommerceShipmentStatus.Pending.wire);
const delay = (milliseconds) => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
const validId = (value) => /^\d+$/.test(String(value));
const exactCartLine = (cart, scenario) => Array.isArray(cart?.lines) && cart.lines.length === 1
  && cart.lines[0]?.sku === scenario.sku && cart.lines[0]?.quantity === scenario.quantity;
const exactMixedDisposition = (disposition) => disposition?.lines?.length === 1
  && disposition.lines[0].quantity === 3 && disposition.lines[0].restockQuantity === 1
  && disposition.lines[0].damagedQuantity === 1 && disposition.lines[0].rejectedQuantity === 1
  && disposition.lines[0].damageReason === 'COSMETIC' && disposition.lines[0].rejectionReason === 'INCOMPLETE_RETURN';

export class CommerceScenarioLoader {
  constructor(config, dataset, dependencies = {}) {
    this.config = config;
    this.dataset = dataset;
    this.fetch = dependencies.fetch ?? fetch;
    this.admin = dependencies.admin ?? new HttpSession(config);
    this.customer = dependencies.customer ?? new HttpSession(config);
    this.journal = dependencies.journal ?? new CommerceJournal(config.journalPath);
    this.address = null;
    this.scenarios = commerceScenarioDataset(dataset.products);
    this.steps = Object.freeze([
      new ScenarioStep('preflight', context => context.preflight()),
      new ScenarioStep('identity', context => context.identity()),
      new ScenarioStep('orders', context => context.orders()),
      new ScenarioStep('verify', context => context.verify()),
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
    if (health?.status !== 'UP') throw new Error('COMMERCE_BACKEND_NOT_READY');
    const provider = await this.fetch(`${this.config.providerUrl}/health`).then(response => response.json());
    if (provider?.ready !== true) throw new Error('COMMERCE_PROVIDER_NOT_READY');
    await this.admin.request('/api/v1/internal/auth/login', { method: 'POST', body: { email: this.config.adminEmail, password: this.config.adminPassword } });
    const capabilities = await this.admin.request('/api/v1/user/capabilities');
    for (const code of ['PAYMENTS_MP', 'MANUAL_FULFILLMENT']) {
      const capability = capabilities.find(row => row?.module === code);
      if (capability?.state !== 'ACTIVE') throw new Error(`COMMERCE_CAPABILITY_NOT_ACTIVE:${code}`);
    }
  }

  async identity() {
    let principal = await this.customer.request('/api/v1/customer/auth/login', { method: 'POST', expected: [200, 401], body: { email: this.config.customerEmail, password: this.config.customerPassword } });
    if (principal === null) principal = await this.customer.request('/api/v1/customer/auth/register', { method: 'POST', expected: [201], body: { email: this.config.customerEmail, password: this.config.customerPassword, firstName: 'Agustín', lastName: 'Demo Ferretería' } });
    if (!validId(principal?.id)) throw new Error('COMMERCE_CUSTOMER_INVALID');
    const addresses = await this.customer.request('/api/v1/customer/me/addresses');
    this.address = addresses.find(row => row?.isDefault) ?? addresses[0] ?? await this.customer.request('/api/v1/customer/me/addresses', { method: 'POST', csrf: true, body: { street: 'Avenida Demo', number: '2209', city: 'Córdoba', province: 'Córdoba', postalCode: '5000', isDefault: true } });
    if (!validId(this.address?.id) || typeof this.address.revision !== 'string') throw new Error('COMMERCE_ADDRESS_INVALID');
  }

  async orders() {
    for (const scenario of this.scenarios) await this.reachScenario(scenario);
  }

  async reachScenario(scenario) {
    let saved = this.journal.scenario(scenario.key);
    if (!saved) {
      saved = { key: scenario.key, kind: scenario.kind.wire, sku: scenario.sku, quantity: scenario.quantity };
      await this.journal.save(scenario.key, saved);
    }
    const decision = saved.orderId ? CommerceReplayDecision.ReplayOrder
      : saved.checkoutCommand ? CommerceReplayDecision.ResumeIntent : CommerceReplayDecision.CreateIntent;
    if (decision === CommerceReplayDecision.CreateIntent) {
      let cart = await this.customer.request('/api/v1/customer/cart');
      if (!Array.isArray(cart?.lines)) throw new Error(`COMMERCE_CART_INVALID:${scenario.key}`);
      if (cart.lines.length === 0) {
        await this.customer.request('/api/v1/customer/cart/items', { method: 'PUT', csrf: true, body: { sku: scenario.sku, quantity: scenario.quantity } });
        cart = await this.customer.request('/api/v1/customer/cart');
      } else if (!exactCartLine(cart, scenario)) {
        throw new Error(`COMMERCE_CART_DRIFT:${scenario.key}`);
      }
      if (!exactCartLine(cart, scenario)) throw new Error(`COMMERCE_CART_WRITE_FAILED:${scenario.key}`);
      const quote = cart.deliveryOptions?.find(option => option.mode === scenario.deliveryMode.wire);
      if (!quote || !Number.isSafeInteger(quote.configurationVersion) || quote.currency !== 'ARS') throw new Error(`COMMERCE_DELIVERY_QUOTE_INVALID:${scenario.key}`);
      const command = {
        idempotencyKey: scenario.idempotencyKey,
        addressId: scenario.deliveryMode === CommerceDeliveryMode.LocalDelivery ? String(this.address.id) : null,
        addressRevision: scenario.deliveryMode === CommerceDeliveryMode.LocalDelivery ? this.address.revision : null,
        cartRevision: cart.revision, currency: 'ARS', deliveryMode: scenario.deliveryMode.wire,
        deliveryConfigurationVersion: quote.configurationVersion,
      };
      saved = { ...saved, checkoutCommand: command };
      await this.journal.save(scenario.key, saved);
    }
    if (!saved.orderId) {
      if (!saved.checkoutCommand || saved.kind !== scenario.kind.wire || saved.sku !== scenario.sku || saved.quantity !== scenario.quantity) throw new Error(`COMMERCE_JOURNAL_SCENARIO_DRIFT:${scenario.key}`);
      const checkout = await this.customer.request('/api/v1/customer/checkout', { method: 'POST', csrf: true, body: saved.checkoutCommand });
      const providerId = this.providerId(checkout.checkoutUrl);
      saved = { ...saved, orderId: String(checkout.orderId), providerId, checkoutUrl: checkout.checkoutUrl };
      await this.journal.save(scenario.key, saved);
    } else {
      this.assertSaved(scenario, saved);
      const replay = await this.customer.request('/api/v1/customer/checkout', { method: 'POST', csrf: true, body: saved.checkoutCommand });
      if (String(replay.orderId) !== saved.orderId) throw new Error(`COMMERCE_CHECKOUT_REPLAY_DRIFT:${scenario.key}`);
    }
    if (expectedPayment(scenario) === CommercePaymentStatus.Approved) await this.accredit(scenario, saved);
    await this.fulfill(scenario, saved);
    if (scenario.returnTarget !== CommerceReturnTarget.None) await this.receive(scenario, saved);
    if (scenario.returnTarget === CommerceReturnTarget.ClosedMixed) await this.dispose(scenario, saved);
  }

  assertSaved(scenario, saved) {
    if (saved.kind !== scenario.kind.wire || saved.sku !== scenario.sku || saved.quantity !== scenario.quantity || !validId(saved.orderId) || !/^cfe-[\w-]+$/.test(saved.providerId ?? '')) throw new Error(`COMMERCE_JOURNAL_SCENARIO_DRIFT:${scenario.key}`);
  }

  providerId(checkoutUrl) {
    if (typeof checkoutUrl !== 'string') throw new Error('COMMERCE_PROVIDER_URL_MISSING');
    const id = new URL(checkoutUrl).pathname.split('/').filter(Boolean).at(-1);
    if (!/^cfe-[\w-]+$/.test(id ?? '')) throw new Error('COMMERCE_PROVIDER_ID_INVALID');
    return id;
  }

  async accredit(scenario, saved) {
    const response = await this.fetch(`${this.config.providerUrl}/fixture/orders/${saved.providerId}/accredit`, { method: 'POST', headers: { Authorization: `Bearer ${this.config.providerToken}` } });
    if (response.status !== 200) throw new Error(`COMMERCE_PROVIDER_ACCREDIT_FAILED:${scenario.key}`);
    const timestamp = String(Date.now());
    const manifest = `id:${saved.providerId.toLowerCase()};request-id:${scenario.webhookRequestId};ts:${timestamp};`;
    const signature = createHmac('sha256', this.config.webhookSecret).update(manifest).digest('hex');
    await this.customer.request(`/api/v1/payments/mercadopago/orders/notifications?data.id=${saved.providerId}&type=order`, {
      method: 'POST', body: { id: scenario.webhookEventId, type: 'order', action: 'order.processed', user_id: 'cfe-user', application_id: 'cfe-app', data: { id: saved.providerId } },
      envelope: false, expected: [200],
      headers: { 'x-request-id': scenario.webhookRequestId, 'x-signature': `ts=${timestamp},v1=${signature}` },
    });
    await this.poll(async () => CommercePaymentStatus.fromWire((await this.admin.request(`/api/v1/user/orders/${saved.orderId}`))?.paymentStatus) === CommercePaymentStatus.Approved, `COMMERCE_ACCREDIT_TIMEOUT:${scenario.key}`);
  }

  async fulfill(scenario, saved) {
    let order = await this.admin.request(`/api/v1/user/orders/${saved.orderId}`);
    const target = expectedShipment(scenario);
    const current = CommerceShipmentStatus.fromWire(order.shipmentStatus);
    if (current === target) return;
    const path = [CommerceShipmentStatus.Pending, ...scenario.shipmentPath.map(row => CommerceShipmentStatus.fromWire(row.wire))];
    const currentIndex = path.indexOf(current);
    if (current === CommerceShipmentStatus.Unknown || currentIndex < 0) throw new Error(`COMMERCE_SHIPMENT_DRIFT:${scenario.key}:${order.shipmentStatus}`);
    for (const targetState of scenario.shipmentPath.slice(currentIndex)) {
      const command = shipmentCommand.get(targetState);
      if (!command) throw new Error(`COMMERCE_SHIPMENT_COMMAND_UNKNOWN:${scenario.key}`);
      await this.admin.request(`/api/v1/user/orders/${saved.orderId}/shipments`, { method: 'POST', csrf: true, body: { status: command, tracking: command === 'SHIPPED' ? `SC-DEMO-${saved.orderId}` : null } });
    }
  }

  async receive(scenario, saved) {
    const order = await this.admin.request(`/api/v1/user/orders/${saved.orderId}`);
    const current = CommerceRmaStatus.fromWire(order.rmaStatus);
    if (current === scenario.returnTarget.expectedRmaStatus) return;
    if (scenario.returnTarget === CommerceReturnTarget.ClosedMixed && current === CommerceRmaStatus.ReturnReceived) return;
    if (current !== CommerceRmaStatus.None) throw new Error(`COMMERCE_RMA_DRIFT:${scenario.key}:${order.rmaStatus}`);
    await this.admin.request(`/api/v1/user/orders/${saved.orderId}/rma`, { method: 'POST', csrf: true, body: { status: 'RECEIVED' } });
  }

  async dispose(scenario, saved) {
    const path = `/api/v1/user/orders/${saved.orderId}/return-disposition`;
    const disposition = await this.admin.request(path);
    const state = CommerceDispositionState.fromWire(disposition.state);
    if (state === CommerceDispositionState.Confirmed) {
      if (!exactMixedDisposition(disposition)) throw new Error(`COMMERCE_DISPOSITION_CONFIRMED_DRIFT:${scenario.key}`);
      return;
    }
    if (state !== CommerceDispositionState.Editable || disposition.lines?.length !== 1 || disposition.lines[0].quantity !== 3) throw new Error(`COMMERCE_DISPOSITION_DRIFT:${scenario.key}`);
    await this.admin.request(path, { method: 'POST', csrf: true, body: { idempotencyKey: scenario.dispositionKey, lines: [{ returnItemId: disposition.lines[0].returnItemId, restockQuantity: 1, damagedQuantity: 1, rejectedQuantity: 1, damageReason: 'COSMETIC', rejectionReason: 'INCOMPLETE_RETURN', observation: 'Demo: una unidad apta, una con daño estético y una devolución incompleta.' }] } });
    const confirmed = await this.admin.request(path);
    if (CommerceDispositionState.fromWire(confirmed.state) !== CommerceDispositionState.Confirmed || !exactMixedDisposition(confirmed)) throw new Error(`COMMERCE_DISPOSITION_CONFIRM_FAILED:${scenario.key}`);
  }

  async poll(predicate, code) {
    const deadline = Date.now() + this.config.timeoutMs;
    while (Date.now() < deadline) { if (await predicate()) return; await delay(200); }
    throw new Error(code);
  }

  async verify() {
    for (const scenario of this.scenarios) {
      const saved = this.journal.scenario(scenario.key); this.assertSaved(scenario, saved);
      const admin = await this.admin.request(`/api/v1/user/orders/${saved.orderId}`);
      const customer = await this.customer.request(`/api/v1/customer/orders/${saved.orderId}`);
      if (CommercePaymentStatus.fromWire(admin.paymentStatus) !== expectedPayment(scenario)
        || CommerceShipmentStatus.fromWire(admin.shipmentStatus) !== expectedShipment(scenario)
        || String(customer.id) !== saved.orderId
        || CommercePaymentStatus.fromWire(customer.paymentStatus) !== CommercePaymentStatus.fromWire(admin.paymentStatus)) throw new Error(`COMMERCE_READBACK_FAILED:${scenario.key}`);
      if (CommerceRmaStatus.fromWire(admin.rmaStatus) !== scenario.returnTarget.expectedRmaStatus) throw new Error(`COMMERCE_RMA_READBACK_FAILED:${scenario.key}`);
      if (scenario.returnTarget === CommerceReturnTarget.ClosedMixed) {
        const disposition = await this.admin.request(`/api/v1/user/orders/${saved.orderId}/return-disposition`);
        if (CommerceDispositionState.fromWire(disposition.state) !== CommerceDispositionState.Confirmed || !exactMixedDisposition(disposition)) throw new Error(`COMMERCE_DISPOSITION_READBACK_FAILED:${scenario.key}`);
      }
    }
  }

  async receipt() {
    const rows = [];
    for (const scenario of this.scenarios) {
      const saved = this.journal.scenario(scenario.key);
      const order = await this.admin.request(`/api/v1/user/orders/${saved.orderId}`);
      rows.push({ key: scenario.key, kind: scenario.kind.wire, orderId: saved.orderId, providerId: saved.providerId, sku: scenario.sku, quantity: scenario.quantity, deliveryMode: scenario.deliveryMode.wire, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, shipmentStatus: order.shipmentStatus, rmaStatus: order.rmaStatus, total: String(order.total) });
    }
    const body = { schemaVersion: 1, namespace: 'ferreteria-falcon-commerce-v1', evidence: 'REAL_BACKEND_LOCAL_PROVIDER', generatedAt: this.journal.value.createdAt, scenarios: rows };
    return { ...body, digest: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
  }
}

async function main() {
  const dataset = await readShowcaseDataset(process.env.STORECORE_SHOWCASE_DATASET_FILE);
  const result = await new CommerceScenarioLoader(CommerceScenarioConfig.fromEnvironment(), dataset).run();
  console.log(JSON.stringify(result, null, 2));
}
const invokedAs = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedAs === import.meta.url) main().catch(error => { console.error(`[commerce-showcase] failed: ${error.message}`); process.exitCode = 1; });
