import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addressMatches,
  ShowcaseAdapterMode, ShowcaseCapability, ShowcaseCapabilityState, ShowcaseConfig,
  ShowcaseOrderStatus, ShowcasePaymentStatus, ShowcaseRole, ShowcaseStage,
} from './load-storecore-showcase.mjs';

const valid = {
  baseUrl: 'http://127.0.0.1:8080', origin: 'http://localhost:4200',
  adminEmail: 'admin@storecore.invalid', adminPassword: 'not-logged-or-serialized',
};

test('closed stage translates known and unknown wires', () => {
  assert.equal(ShowcaseStage.fromWire('CART'), ShowcaseStage.Cart);
  assert.equal(ShowcaseStage.fromWire('future-stage'), ShowcaseStage.Unknown);
  assert.throws(() => new ShowcaseStage(null, 'INJECTED', 'Injected'), /closed/);
});

test('roles, adapter modes and commerce statuses translate unknown wires closed', () => {
  assert.equal(ShowcaseRole.fromWire('ADMIN'), ShowcaseRole.Admin);
  assert.equal(ShowcaseRole.fromWire('OWNER'), ShowcaseRole.Unknown);
  assert.equal(ShowcaseAdapterMode.fromWire('unconfigured'), ShowcaseAdapterMode.Unconfigured);
  assert.equal(ShowcaseAdapterMode.fromWire('official'), ShowcaseAdapterMode.Unknown);
  assert.equal(ShowcasePaymentStatus.fromWire('PENDING'), ShowcasePaymentStatus.Pending);
  assert.equal(ShowcasePaymentStatus.fromWire('APPROVED'), ShowcasePaymentStatus.Unknown);
  assert.equal(ShowcaseOrderStatus.fromWire('PENDING_PAYMENT'), ShowcaseOrderStatus.PendingPayment);
  assert.equal(ShowcaseOrderStatus.fromWire('PAID'), ShowcaseOrderStatus.Unknown);
});

test('showcase capabilities and states are closed and fail unknown wires closed', () => {
  assert.equal(ShowcaseCapability.fromWire('CATALOG'), ShowcaseCapability.Catalog);
  assert.equal(ShowcaseCapability.fromWire('ML_PRICE_AUTOMATION'), ShowcaseCapability.Unknown);
  assert.throws(() => new ShowcaseCapability(null, 'INJECTED'), /closed/);
  assert.equal(ShowcaseCapabilityState.fromWire('ACTIVE'), ShowcaseCapabilityState.Active);
  assert.equal(ShowcaseCapabilityState.fromWire('PAUSED'), ShowcaseCapabilityState.Unknown);
  assert.throws(() => new ShowcaseCapabilityState(null, 'INJECTED'), /closed/);
});
test('config accepts only explicit loopback targets', () => {
  const config = new ShowcaseConfig(valid);
  assert.equal(config.baseUrl, 'http://127.0.0.1:8080');
  assert.equal(config.customerEmail, 'showcase.customer@storecore.invalid');
  assert.throws(() => new ShowcaseConfig({ ...valid, baseUrl: 'https://store.example.com' }), /LOOPBACK_TARGET/);
  assert.throws(() => new ShowcaseConfig({ ...valid, origin: 'https://admin.example.com' }), /LOOPBACK_ORIGIN/);
  assert.throws(() => new ShowcaseConfig({ ...valid, origin: 'https://localhost:4200' }), /LOOPBACK_ORIGIN/);
  assert.throws(() => new ShowcaseConfig({ ...valid, origin: 'ftp://127.0.0.1' }), /LOOPBACK_ORIGIN/);
});

test('config requires admin authority and synthetic customer identity', () => {
  assert.throws(() => new ShowcaseConfig({ ...valid, adminPassword: '' }), /ADMIN_PASSWORD_REQUIRED/);
  assert.throws(() => new ShowcaseConfig({ ...valid, customerEmail: 'real@example.com' }), /INVALID_TLD/);
});

test('address reconciliation compares every deterministic fixture field', () => {
  const expected = { street: 'Avenida Siempre Viva', number: '2209', city: 'Córdoba', province: 'Córdoba', postalCode: '5000', isDefault: true };
  assert.equal(addressMatches({ id: 7, ...expected }, expected), true);
  for (const [field, value] of [['street', 'Otra'], ['number', '2210'], ['city', 'Rosario'], ['province', 'Santa Fe'], ['postalCode', '2000'], ['isDefault', false]]) {
    assert.equal(addressMatches({ id: 7, ...expected, [field]: value }, expected), false, field);
  }
});
