import assert from 'node:assert/strict';
import test from 'node:test';
import { CommerceDeliveryMode, CommerceDispositionState, CommercePaymentStatus, CommerceReplayDecision, CommerceReturnTarget,
  CommerceRmaStatus, CommerceScenarioKind, CommerceShipmentCommand, CommerceShipmentStatus, commerceScenarioDataset, stableUuid } from './commerce-scenario-dataset.mjs';

const products = Array.from({ length: 12 }, (_, index) => ({ sku: `SHOW-${index}`, stock: 10, price: 1000 + index }));
test('nine scenarios are closed, deterministic and use distinct catalog products', () => {
  const first = commerceScenarioDataset(products);
  const second = commerceScenarioDataset(products);
  assert.equal(first.length, 9);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map(row => row.sku)).size, 9);
  assert.equal(first.filter(row => row.kind !== CommerceScenarioKind.PendingPayment).length, 8);
  assert.equal(first.filter(row => row.deliveryMode === CommerceDeliveryMode.Pickup).length, 2);
  assert.equal(first.filter(row => row.returnTarget !== CommerceReturnTarget.None).length, 2);
  assert.equal(first.filter(row => row.returnTarget === CommerceReturnTarget.ClosedMixed).length, 1);
  assert.equal(first.find(row => row.kind === CommerceScenarioKind.ReturnClosedMixed).quantity, 3);
  assert.equal(first.reduce((total, row) => total + row.quantity, 0), 19);
  assert.equal(first.filter(row => row.kind !== CommerceScenarioKind.PendingPayment).reduce((total, row) => total + row.quantity, 0), 17);
  assert.match(stableUuid('same'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('unknown wires fail closed and insufficient products are rejected', () => {
  assert.equal(CommerceScenarioKind.fromWire('invented'), CommerceScenarioKind.Unknown);
  assert.equal(CommerceDeliveryMode.fromWire('invented'), CommerceDeliveryMode.Unknown);
  assert.equal(CommerceShipmentCommand.fromWire('invented'), CommerceShipmentCommand.Unknown);
  assert.equal(CommercePaymentStatus.fromWire('invented'), CommercePaymentStatus.Unknown);
  assert.equal(CommerceShipmentStatus.fromWire('invented'), CommerceShipmentStatus.Unknown);
  assert.equal(CommerceRmaStatus.fromWire('invented'), CommerceRmaStatus.Unknown);
  assert.equal(CommerceDispositionState.fromWire('invented'), CommerceDispositionState.Unknown);
  assert.equal(CommerceReturnTarget.fromWire('invented'), CommerceReturnTarget.Unknown);
  assert.equal(CommerceReplayDecision.fromWire('invented'), CommerceReplayDecision.Unknown);
  assert.equal(CommerceReturnTarget.Received.expectedRmaStatus, CommerceRmaStatus.ReturnReceived);
  assert.equal(CommerceReturnTarget.ClosedMixed.expectedRmaStatus, CommerceRmaStatus.Closed);
  assert.throws(() => commerceScenarioDataset(products.slice(0, 8)), /nine saleable products/);
  assert.throws(() => new CommerceScenarioKind(null, 'ILLEGAL'), /Closed wire type/);
});
