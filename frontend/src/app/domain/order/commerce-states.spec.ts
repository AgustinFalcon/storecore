import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from './commerce-states';

describe('commerce wire boundary', () => {
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
