import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PresentationCapabilityModule, PresentationCapabilityState, PresentationCurrency, PresentationDeliveryMode,
  PresentationHealthStatus, PresentationOrderStatus, PresentationPricePolicyState, PresentationPricePolicyTransition,
  PresentationPriceScope, PresentationPriceWriter, PresentationRunState, presentationVolumeDataset } from './presentation-volume-dataset.mjs';
import { PresentationVolumeConfig, PresentationVolumeLoader } from './load-presentation-volume.mjs';

const source = JSON.parse(await readFile(new URL('./datasets/ferreteria-full-showcase.json', import.meta.url), 'utf8'));

test('presentation dataset is dense, deterministic and uses only synthetic identities', () => {
  const first = presentationVolumeDataset(source.products);
  const replay = presentationVolumeDataset(source.products);
  assert.equal(first.digest, replay.digest);
  assert.equal(first.customers.length, 24);
  assert.equal(first.policies.length, 12);
  assert.equal(new Set(first.customers.map(row => row.email)).size, 24);
  assert.equal(new Set(first.customers.map(row => row.idempotencyKey)).size, 24);
  assert.equal(new Set(first.policies.map(row => row.sku)).size, 12);
  assert.ok(first.customers.every(row => row.email.endsWith('@storecore.invalid')));
  assert.equal(first.customers.reduce((sum, row) => sum + row.addresses.length, 0), 36);
  assert.equal(first.customers.reduce((sum, row) => sum + row.favoriteSkus.length, 0), 48);
  assert.deepEqual(first.policies.map(row => row.target.wire), [
    'DRAFT', 'DRAFT', 'DRAFT', 'DRAFT', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'PAUSED', 'PAUSED', 'PAUSED', 'PAUSED',
  ]);
});

test('all presentation finite states translate at one closed boundary', () => {
  for (const type of [PresentationRunState, PresentationPricePolicyState, PresentationPricePolicyTransition,
    PresentationDeliveryMode, PresentationOrderStatus, PresentationHealthStatus, PresentationCapabilityModule,
    PresentationCapabilityState, PresentationCurrency, PresentationPriceScope, PresentationPriceWriter]) {
    for (const value of type.values) assert.equal(type.fromWire(value.wire), value);
    assert.equal(type.fromWire('NEW_SERVER_VALUE'), type.Unknown);
    assert.equal(type.fromWire(null), type.Unknown);
    assert.throws(() => new type('NEW_SERVER_VALUE', 'Injected'), /PRESENTATION_CLOSED_TYPE_CONSTRUCTOR/);
  }
});

test('policy recovery adopts the single committed response and never duplicates a lost journal write', async () => {
  const command = { listingSku: 'SKU-RECOVERY', currency: 'ARS', priceScope: 'DEFAULT', desiredPrice: 900,
    effectivePromoPrice: null, validFrom: '2026-11-21T00:00:00.000Z', validTo: '2027-02-20T00:00:00.000Z', writer: 'MANUAL' };
  const fixture = { key: 'policy-01', sku: command.listingSku, desiredPrice: command.desiredPrice, target: PresentationPricePolicyState.Draft };
  const persisted = { key: fixture.key, sku: fixture.sku, target: fixture.target.wire, command };
  const policies = [];
  const journal = { value: { createdAt: command.validFrom }, policy: () => persisted,
    save: async () => { throw new Error('SIMULATED_JOURNAL_LOSS'); } };
  const admin = { request: async (path, options = {}) => {
    if (path.startsWith('/api/v1/user/promos?page=')) return { items: [...policies], total: policies.length };
    if (path === '/api/v1/user/promos' && options.method === 'POST') {
      const created = { id: String(policies.length + 1), ...options.body, status: 'DRAFT' };
      policies.push(created); return created;
    }
    throw new Error(`UNEXPECTED_REQUEST:${path}`);
  } };
  const loader = new PresentationVolumeLoader({}, {}, { dataset: { customers: [], policies: [fixture], digest: 'digest' }, admin, journal });
  await assert.rejects(() => loader.seedPolicies(), /SIMULATED_JOURNAL_LOSS/);
  assert.equal(policies.length, 1);
  journal.save = async (_section, _key, value) => { persisted.policyId = value.policyId; };
  await loader.seedPolicies();
  assert.equal(policies.length, 1);
  assert.equal(persisted.policyId, '1');
});

test('presentation dataset rejects insufficient or unsafe product input', () => {
  assert.throws(() => presentationVolumeDataset([]), /PRESENTATION_PRODUCTS_INSUFFICIENT/);
  const duplicated = Array.from({ length: 40 }, () => ({ sku: 'DUPLICATE', stock: 10, price: 100 }));
  assert.throws(() => presentationVolumeDataset(duplicated), /PRESENTATION_PRODUCTS_INVALID/);
});

test('presentation config accepts loopback only and requires explicit journal evidence paths', () => {
  const valid = { baseUrl: 'http://127.0.0.1:8080', origin: 'http://127.0.0.1:4200',
    adminEmail: 'admin@storecore.invalid', adminPassword: 'not-a-real-secret', journalPath: './tmp/journal.json', receiptPath: './tmp/receipt.json' };
  assert.equal(new PresentationVolumeConfig(valid).baseUrl, 'http://127.0.0.1:8080');
  assert.throws(() => new PresentationVolumeConfig({ ...valid, baseUrl: 'https://store.example.com' }), /LOOPBACK_TARGET/);
  assert.throws(() => new PresentationVolumeConfig({ ...valid, journalPath: '' }), /JOURNAL_PATH_REQUIRED/);
});
