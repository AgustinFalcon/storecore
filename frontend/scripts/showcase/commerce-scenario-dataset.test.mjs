import assert from 'node:assert/strict';
import test from 'node:test';
import { CommerceDeliveryMode, CommerceScenarioKind, CommerceShipmentCommand, commerceScenarioDataset, stableUuid } from './commerce-scenario-dataset.mjs';

const products = Array.from({ length: 12 }, (_, index) => ({ sku: `SHOW-${index}`, stock: 10, price: 1000 + index }));
test('nine scenarios are closed, deterministic and use distinct catalog products', () => {
  const first = commerceScenarioDataset(products);
  const second = commerceScenarioDataset(products);
  assert.equal(first.length, 9);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map(row => row.sku)).size, 9);
  assert.equal(first.filter(row => row.kind !== CommerceScenarioKind.PendingPayment).length, 8);
  assert.equal(first.filter(row => row.deliveryMode === CommerceDeliveryMode.Pickup).length, 2);
  assert.equal(first.filter(row => row.receiveReturn).length, 2);
  assert.equal(first.filter(row => row.closeMixedReturn).length, 1);
  assert.equal(first.find(row => row.kind === CommerceScenarioKind.ReturnClosedMixed).quantity, 3);
  assert.equal(first.reduce((total, row) => total + row.quantity, 0), 19);
  assert.equal(first.filter(row => row.kind !== CommerceScenarioKind.PendingPayment).reduce((total, row) => total + row.quantity, 0), 17);
  assert.match(stableUuid('same'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('unknown wires fail closed and insufficient products are rejected', () => {
  assert.equal(CommerceScenarioKind.fromWire('invented'), CommerceScenarioKind.Unknown);
  assert.equal(CommerceDeliveryMode.fromWire('invented'), CommerceDeliveryMode.Unknown);
  assert.equal(CommerceShipmentCommand.fromWire('invented'), CommerceShipmentCommand.Unknown);
  assert.throws(() => commerceScenarioDataset(products.slice(0, 8)), /nine saleable products/);
  assert.throws(() => new CommerceScenarioKind(null, 'ILLEGAL'), /Closed wire type/);
});
