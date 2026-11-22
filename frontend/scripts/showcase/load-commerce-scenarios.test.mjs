import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { CommerceScenarioConfig, CommerceScenarioLoader } from './load-commerce-scenarios.mjs';

const valid = () => ({
  baseUrl: 'http://127.0.0.1:8080', origin: 'https://localhost:4301', providerUrl: 'http://127.0.0.1:4302',
  adminEmail: 'admin@example.test', adminPassword: 'local-password', customerEmail: 'demo@storecore.invalid',
  journalPath: join(tmpdir(), 'storecore-commerce-test-journal.json'), receiptPath: join(tmpdir(), 'storecore-commerce-test-receipt.json'),
});

test('commerce runner accepts only loopback services and synthetic customer identity', () => {
  const config = new CommerceScenarioConfig(valid());
  assert.equal(config.origin, 'https://localhost:4301');
  assert.equal(config.providerUrl, 'http://127.0.0.1:4302');
  assert.throws(() => new CommerceScenarioConfig({ ...valid(), baseUrl: 'https://storecore.example.test' }), /LOOPBACK_REQUIRED/);
  assert.throws(() => new CommerceScenarioConfig({ ...valid(), providerUrl: 'https://localhost:4302' }), /LOOPBACK_REQUIRED/);
  assert.throws(() => new CommerceScenarioConfig({ ...valid(), origin: 'https://storecore.example.test' }), /LOOPBACK_REQUIRED/);
  assert.throws(() => new CommerceScenarioConfig({ ...valid(), customerEmail: 'real@example.com' }), /INVALID_TLD/);
});

const products = Array.from({ length: 9 }, (_, index) => ({ sku: `RECOVER-${index}`, stock: 10, price: 1000 + index }));
const memoryJournal = () => ({
  value: { createdAt: '2026-11-22T00:00:00.000Z', scenarios: {} },
  scenario(key) { return this.value.scenarios[key] ?? null; },
  async save(key, value) { this.value.scenarios[key] = structuredClone(value); },
});

test('commerce scenario resumes an interrupted durable cart mutation exactly once', async () => {
  const journal = memoryJournal();
  let cart = { revision: 'cart-1', lines: [], deliveryOptions: [{ mode: 'LOCAL_DELIVERY', configurationVersion: 7, currency: 'ARS' }] };
  let failAfterMutation = true;
  const customer = { request: async (path, options = {}) => {
    if (path === '/api/v1/customer/cart/items') {
      cart = { ...cart, revision: 'cart-2', lines: [{ sku: options.body.sku, quantity: options.body.quantity }] };
      if (failAfterMutation) { failAfterMutation = false; throw new Error('simulated response loss'); }
      return null;
    }
    if (path === '/api/v1/customer/cart') return structuredClone(cart);
    if (path === '/api/v1/customer/checkout') return { orderId: 41, checkoutUrl: 'http://127.0.0.1:4302/checkout/cfe-recovered' };
    throw new Error(`unexpected customer path ${path}`);
  } };
  const admin = { request: async () => ({ paymentStatus: 'PENDING', shipmentStatus: 'PENDING', rmaStatus: 'NONE' }) };
  const loader = new CommerceScenarioLoader(new CommerceScenarioConfig(valid()), { products }, { journal, customer, admin });
  loader.address = { id: 7, revision: 'address-1' };
  await assert.rejects(loader.reachScenario(loader.scenarios[0]), /simulated response loss/);
  assert.deepEqual(Object.keys(journal.value.scenarios), ['pending-payment']);
  assert.equal(journal.value.scenarios['pending-payment'].checkoutCommand, undefined);
  await loader.reachScenario(loader.scenarios[0]);
  assert.equal(journal.value.scenarios['pending-payment'].orderId, '41');
  assert.equal(cart.lines.length, 1);
});

test('confirmed mixed disposition with wrong quantities fails closed', async () => {
  const journal = memoryJournal();
  const admin = { request: async () => ({ state: 'CONFIRMED', lines: [{ quantity: 3, restockQuantity: 3, damagedQuantity: 0, rejectedQuantity: 0 }] }) };
  const loader = new CommerceScenarioLoader(new CommerceScenarioConfig(valid()), { products }, { journal, admin, customer: {} });
  const scenario = loader.scenarios.at(-1);
  await assert.rejects(loader.dispose(scenario, { orderId: '42' }), /COMMERCE_DISPOSITION_CONFIRMED_DRIFT/);
});

test('drifted partial intent aborts before cart or journal mutation', async () => {
  const journal = memoryJournal();
  journal.value.scenarios['pending-payment'] = { key: 'pending-payment', kind: 'PENDING_PAYMENT', sku: 'OLD-SKU', quantity: 2 };
  let requests = 0; let saves = 0;
  journal.save = async () => { saves += 1; };
  const customer = { request: async () => { requests += 1; throw new Error('HTTP must not run'); } };
  const loader = new CommerceScenarioLoader(new CommerceScenarioConfig(valid()), { products }, { journal, customer, admin: {} });
  await assert.rejects(loader.reachScenario(loader.scenarios[0]), /COMMERCE_JOURNAL_SCENARIO_DRIFT/);
  assert.equal(requests, 0);
  assert.equal(saves, 0);
});
