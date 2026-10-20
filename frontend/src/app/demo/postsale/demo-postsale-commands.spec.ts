import { ShipmentStatus } from '../../domain/order/shipment-status';
import { DemoReturnAccounting, DemoReturnDisposition, DemoReturnInspectionResult, DemoReturnReason, DemoReturnStatus } from './postsale-types';
import { DemoReturnPolicy } from './return-policy';
import { postSaleFixture } from './postsale-test-fixture';

describe('DemoPostSaleCommands', () => {
  const selection = (variantId: string, quantity = 1) => [{ variantId, quantity, reason: DemoReturnReason.Damaged }];

  it('requires an owned paid delivered order and explicit known selections', () => {
    const fixture = postSaleFixture();
    const id = fixture.order.lines[0].variantId;
    fixture.order.shipment = ShipmentStatus.Shipped;
    expect(() => fixture.commands.request('customer', 'command-1', fixture.order.id, selection(id))).toThrow('entregado');
    fixture.order.shipment = ShipmentStatus.Delivered;
    expect(() => fixture.commands.request('foreign', 'command-1', fixture.order.id, selection(id))).toThrow('permiso');
    expect(() => fixture.commands.request('customer', 'command-1', fixture.order.id, [{ variantId: id, quantity: 1, reason: DemoReturnReason.Unknown }])).toThrow('motivo');
    expect(fixture.snapshot.returns).toHaveLength(0);
  });

  it('deduplicates one command and rejects a reused key with another payload', () => {
    const fixture = postSaleFixture();
    const id = fixture.order.lines[0].variantId;
    const first = fixture.commands.request('customer', 'same-command', fixture.order.id, selection(id));
    const revision = fixture.snapshot.revision;
    expect(fixture.commands.request('customer', 'same-command', fixture.order.id, selection(id))).toBe(first);
    expect(fixture.snapshot.revision).toBe(revision);
    expect(() => fixture.commands.request('customer', 'same-command', fixture.order.id, selection(id, 2))).toThrow('otros datos');
  });

  it('reserves only eligible quantities and releases them when cancelled or rejected', () => {
    const fixture = postSaleFixture();
    const id = fixture.order.lines[0].variantId;
    const policy = new DemoReturnPolicy();
    const cancelled = fixture.commands.request('customer', 'cancel', fixture.order.id, selection(id, 2));
    expect(policy.available(fixture.order, fixture.snapshot.returns, id)).toBe(1);
    fixture.commands.cancel('customer', cancelled.id);
    fixture.commands.cancel('customer', cancelled.id);
    expect(policy.available(fixture.order, fixture.snapshot.returns, id)).toBe(3);
    const rejected = fixture.commands.request('customer', 'reject', fixture.order.id, selection(id, 3));
    fixture.commands.decide('admin', rejected.id, false, 'Fuera de política');
    expect(policy.available(fixture.order, fixture.snapshot.returns, id)).toBe(3);
  });

  it('keeps receive, inspect, disposition and refund as distinct guarded steps', () => {
    const fixture = postSaleFixture();
    const id = fixture.order.lines[0].variantId;
    const request = fixture.commands.request('customer', 'steps', fixture.order.id, selection(id));
    expect(() => fixture.commands.receive('admin', request.id)).toThrow('aprobada');
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    expect(request.status).toBe(DemoReturnStatus.Received);
    expect(() => fixture.commands.dispose('admin', request.id, [{ variantId: id, disposition: DemoReturnDisposition.Restock }])).toThrow('inspeccionada');
    fixture.commands.inspect('admin', request.id, 'Completa y sin faltantes', DemoReturnInspectionResult.Complete);
    expect(request.status).toBe(DemoReturnStatus.Inspected);
    expect(() => fixture.commands.refund('admin', request.id)).toThrow('disposición');
  });

  it('restocks sellable and records damaged physical units without increasing availability', () => {
    const fixture = postSaleFixture();
    const [sellable, damaged] = fixture.order.lines;
    const request = fixture.commands.request('customer', 'mixed', fixture.order.id, [
      { variantId: sellable.variantId, quantity: 1, reason: DemoReturnReason.ChangedMind },
      { variantId: damaged.variantId, quantity: 1, reason: DemoReturnReason.Defective },
    ]);
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Ambas unidades revisadas', DemoReturnInspectionResult.Complete);
    const sellableBefore = fixture.catalog.available(sellable.sku, sellable.variantId);
    const damagedBefore = fixture.catalog.available(damaged.sku, damaged.variantId);
    fixture.commands.dispose('admin', request.id, [
      { variantId: sellable.variantId, disposition: DemoReturnDisposition.Restock },
      { variantId: damaged.variantId, disposition: DemoReturnDisposition.Damaged },
    ]);
    const revision = fixture.snapshot.revision;
    fixture.commands.dispose('admin', request.id, [
      { variantId: sellable.variantId, disposition: DemoReturnDisposition.Restock },
      { variantId: damaged.variantId, disposition: DemoReturnDisposition.Damaged },
    ]);
    expect(fixture.snapshot.revision).toBe(revision);
    expect(fixture.catalog.available(sellable.sku, sellable.variantId)).toBe(sellableBefore + 1);
    expect(fixture.catalog.available(damaged.sku, damaged.variantId)).toBe(damagedBefore);
    expect(request.lines.map(line => line.accounting)).toEqual([DemoReturnAccounting.Sellable, DemoReturnAccounting.Damaged]);
  });

  it('refunds merchandise once, excludes shipping and preserves the original order total', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const originalTotal = fixture.order.total;
    const request = fixture.commands.request('customer', 'refund', fixture.order.id, selection(line.variantId, 2));
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Completa', DemoReturnInspectionResult.Complete);
    fixture.commands.dispose('admin', request.id, [{ variantId: line.variantId, disposition: DemoReturnDisposition.Restock }]);
    fixture.commands.refund('admin', request.id);
    const snapshot = JSON.stringify(fixture.snapshot);
    fixture.commands.refund('admin', request.id);
    expect(JSON.stringify(fixture.snapshot)).toBe(snapshot);
    expect(request.refundedAmount).toBe(line.unit * 2);
    expect(request.refundId).toBe(`SIM-REFUND-${request.id}`);
    expect(fixture.order.total).toBe(originalTotal);
    expect(new DemoReturnPolicy().refundStatus(fixture.order, fixture.snapshot.returns).label).toBe('Reembolso parcial');
  });

  it('validates the full disposition before any stock mutation and enforces admin authority', () => {
    const fixture = postSaleFixture();
    const [first, second] = fixture.order.lines;
    const request = fixture.commands.request('customer', 'atomic', fixture.order.id, [
      { variantId: first.variantId, quantity: 1, reason: DemoReturnReason.Damaged },
      { variantId: second.variantId, quantity: 1, reason: DemoReturnReason.Defective },
    ]);
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Completa', DemoReturnInspectionResult.Complete);
    const before = JSON.stringify(fixture.snapshot);
    expect(() => fixture.commands.dispose('customer', request.id, [])).toThrow('administrativo');
    expect(() => fixture.commands.dispose('admin', request.id, [{ variantId: first.variantId, disposition: DemoReturnDisposition.Restock }])).toThrow('cada producto');
    expect(JSON.stringify(fixture.snapshot)).toBe(before);
  });

  it('fails closed for Unknown states instead of treating raw strings as valid', () => {
    const fixture = postSaleFixture();
    const request = fixture.commands.request('customer', 'unknown', fixture.order.id, selection(fixture.order.lines[0].variantId));
    request.status = DemoReturnStatus.Unknown;
    expect(() => fixture.commands.decide('admin', request.id, true, 'Autorizada')).toThrow('no disponible');
  });
});
