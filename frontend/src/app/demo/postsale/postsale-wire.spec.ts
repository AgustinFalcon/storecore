import { DemoPostSaleWire } from './postsale-wire';
import { DemoReturnAccounting, DemoReturnDisposition, DemoReturnInspectionResult, DemoReturnReason, DemoReturnStatus } from './postsale-types';
import { postSaleFixture } from './postsale-test-fixture';

describe('DemoPostSaleWire', () => {
  it('rehydrates all finite values at the single boundary', () => {
    const fixture = postSaleFixture();
    const request = fixture.commands.request('customer', 'wire', fixture.order.id, [{ variantId: fixture.order.lines[0].variantId, quantity: 1, reason: DemoReturnReason.Damaged }]);
    const restored = DemoPostSaleWire.request(JSON.parse(JSON.stringify(request)));
    expect(restored.status).toBe(DemoReturnStatus.Requested);
    expect(restored.inspectionResult).toBe(DemoReturnInspectionResult.Unknown);
    expect(restored.lines[0].reason).toBe(DemoReturnReason.Damaged);
    expect(restored.lines[0].disposition).toBe(DemoReturnDisposition.Pending);
    expect(restored.lines[0].accounting).toBe(DemoReturnAccounting.NotRecorded);
  });

  it('maps invented finite values to Unknown and commands stay fail-closed', () => {
    const fixture = postSaleFixture();
    const request = fixture.commands.request('customer', 'unknown-wire', fixture.order.id, [{ variantId: fixture.order.lines[0].variantId, quantity: 1, reason: DemoReturnReason.Damaged }]);
    const raw = JSON.parse(JSON.stringify(request));
    raw.status = { wire: 'invented' };
    raw.lines[0].reason = { wire: 'invented' };
    const restored = DemoPostSaleWire.request(raw);
    expect(restored.status).toBe(DemoReturnStatus.Unknown);
    expect(restored.lines[0].reason).toBe(DemoReturnReason.Unknown);
  });

  it('rejects duplicate operations, excess quantities and forged refund evidence', () => {
    const fixture = postSaleFixture();
    const request = fixture.commands.request('customer', 'validate', fixture.order.id, [{ variantId: fixture.order.lines[0].variantId, quantity: 1, reason: DemoReturnReason.Damaged }]);
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [request, { ...request }])).toThrow('duplicadas');
    request.lines[0].quantity = fixture.order.lines[0].quantity + 1;
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [request])).toThrow('supera');
    request.lines[0].quantity = 1;
    request.status = DemoReturnStatus.Refunded;
    request.refundedAmount = request.lines[0].refund;
    request.refundId = 'forged';
    expect(() => DemoPostSaleWire.validateOrder(fixture.order, [request])).toThrow('comprobante');
  });
});
