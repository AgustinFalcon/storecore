import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PresentationDeliveryMode, PresentationOrderStatus, PresentationPricePolicyState,
  PresentationPricePolicyTransition, PresentationRunState, presentationVolumeDataset } from './presentation-volume-dataset.mjs';
import { PresentationVolumeConfig } from './load-presentation-volume.mjs';

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
    PresentationDeliveryMode, PresentationOrderStatus]) {
    for (const value of type.values) assert.equal(type.fromWire(value.wire), value);
    assert.equal(type.fromWire('NEW_SERVER_VALUE'), type.Unknown);
    assert.equal(type.fromWire(null), type.Unknown);
  }
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
