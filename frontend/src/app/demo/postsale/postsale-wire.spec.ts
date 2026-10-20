import { DemoPostSaleWire } from './postsale-wire';
import { DemoReturnAccounting, DemoReturnDisposition, DemoReturnInspectionResult, DemoReturnReason, DemoReturnStatus } from './postsale-types';
import { postSaleFixture } from './postsale-test-fixture';

describe('DemoPostSaleWire', () => {
  it('rehydrates all finite values at the single boundary', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const request = fixture.commands.request('customer', 'wire', fixture.order.id, [{ sku: line.sku, variantId: line.variantId, quantity: 1, reason: DemoReturnReason.Damaged }]);
    const restored = DemoPostSaleWire.request(JSON.parse(JSON.stringify(request)));
    expect(restored.status).toBe(DemoReturnStatus.Requested);
    expect(restored.inspectionResult).toBe(DemoReturnInspectionResult.Unknown);
    expect(restored.lines[0].reason).toBe(DemoReturnReason.Damaged);
    expect(restored.lines[0].disposition).toBe(DemoReturnDisposition.Pending);
    expect(restored.lines[0].accounting).toBe(DemoReturnAccounting.NotRecorded);
  });

  it('maps invented finite values to Unknown and commands stay fail-closed', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const request = fixture.commands.request('customer', 'unknown-wire', fixture.order.id, [{ sku: line.sku, variantId: line.variantId, quantity: 1, reason: DemoReturnReason.Damaged }]);
    const raw = JSON.parse(JSON.stringify(request));
    raw.status = { wire: 'invented' };
    raw.lines[0].reason = { wire: 'invented' };
    const restored = DemoPostSaleWire.request(raw);
    expect(restored.status).toBe(DemoReturnStatus.Unknown);
    expect(restored.lines[0].reason).toBe(DemoReturnReason.Unknown);
  });

  it('rejects duplicate operations, excess quantities and forged refund evidence', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const request = fixture.commands.request('customer', 'validate', fixture.order.id, [{ sku: line.sku, variantId: line.variantId, quantity: 1, reason: DemoReturnReason.Damaged }]);
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [request, { ...request }])).toThrow('duplicadas');
    request.lines[0].quantity = fixture.order.lines[0].quantity + 1;
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [request])).toThrow('supera');
    request.lines[0].quantity = 1;
    request.status = DemoReturnStatus.Refunded;
    request.refundedAmount = request.lines[0].refund;
    request.refundId = 'forged';
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [request])).toThrow('comprobante');
  });

  it('rejects status, inspection, disposition and accounting combinations that could replay stock', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const request = fixture.commands.request('customer', 'matrix', fixture.order.id, [{ sku: line.sku, variantId: line.variantId, quantity: 1, reason: DemoReturnReason.Damaged }]);
    request.lines[0].disposition = DemoReturnDisposition.Restock;
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [request])).toThrow('contabilidad');
    request.lines[0].disposition = DemoReturnDisposition.Pending;
    request.status = DemoReturnStatus.Inspected;
    request.inspectionNotes = 'Todavía falta revisar';
    request.inspectionResult = DemoReturnInspectionResult.NeedsReview;
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [request])).toThrow('inspección completa');
    request.inspectionResult = DemoReturnInspectionResult.Complete;
    request.status = DemoReturnStatus.Disposed;
    request.lines[0].disposition = DemoReturnDisposition.Restock;
    request.lines[0].accounting = DemoReturnAccounting.NotRecorded;
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [request])).toThrow('contabilidad');
    request.lines[0].accounting = DemoReturnAccounting.Sellable;
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [request])).not.toThrow();
  });

  it('treats duplicate variant ids on different products as distinct persisted lines', () => {
    const fixture = postSaleFixture();
    const first = fixture.order.lines[0];
    fixture.order.lines.push({ ...first, sku: 'SECOND-SKU', name: 'Segundo producto', quantity: 1 });
    fixture.order.total += first.unit;
    const raw = fixture.commands.request('customer', 'wire-composite', fixture.order.id, [
      { sku: first.sku, variantId: first.variantId, quantity: 1, reason: DemoReturnReason.Damaged },
      { sku: 'SECOND-SKU', variantId: first.variantId, quantity: 1, reason: DemoReturnReason.Defective },
    ]);
    const restored = DemoPostSaleWire.request(JSON.parse(JSON.stringify(raw)));
    expect(restored.lines).toHaveLength(2);
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [restored])).not.toThrow();
  });
});
