import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from './commerce-states';

describe('commerce wire boundary', () => {
  it('preserves authoritative blockers while requiring approved payment for eligibility', () => {
    for (const payment of [PaymentStatus.Pending, PaymentStatus.Unknown, PaymentStatus.Approved]) {
      expect(FulfillmentEligibility.OrderNotPaid.withPaymentStatus(payment)).toBe(FulfillmentEligibility.OrderNotPaid);
      expect(FulfillmentEligibility.ReversalOrIncident.withPaymentStatus(payment)).toBe(FulfillmentEligibility.ReversalOrIncident);
    }
    expect(FulfillmentEligibility.Eligible.withPaymentStatus(PaymentStatus.Pending)).toBe(FulfillmentEligibility.PaymentNotVerified);
    expect(FulfillmentEligibility.Eligible.withPaymentStatus(PaymentStatus.Unknown)).toBe(FulfillmentEligibility.PaymentNotVerified);
    for (const payment of [PaymentStatus.Refunded, PaymentStatus.ChargedBack, PaymentStatus.Cancelled]) {
      expect(FulfillmentEligibility.Eligible.withPaymentStatus(payment)).toBe(FulfillmentEligibility.ReversalOrIncident);
    }
    expect(FulfillmentEligibility.StockNotVerified.withPaymentStatus(PaymentStatus.Approved)).toBe(FulfillmentEligibility.StockNotVerified);
    expect(FulfillmentEligibility.Unknown.withPaymentStatus(PaymentStatus.Approved)).toBe(FulfillmentEligibility.Unknown);
  });
  for (const type of [OrderStatus, PaymentStatus, ShipmentStatus, RmaStatus, ShipmentTransition, RmaTransition, FulfillmentEligibility]) {
    it(`roundtrips every ${type.name} case and rejects malformed wires`, () => {
      for (const value of Object.values(type)) {
        if (value instanceof type) expect(type.fromWire(value.wire)).toBe(value);
      }
      for (const wire of [undefined, null, '', 'paid', ' PAID', 'UNTRUSTED_STATE', 1, {}]) {
        expect(type.fromWire(wire)).toBe(type.Unknown);
        expect(type.fromWire(wire).label).toBe(type.Unknown.label);
      }
    });
  }
});
