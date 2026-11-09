import { mapAdminOrder, mapCustomerOrder, mapOrderPage } from '../mappers/http-mappers';
import { OrderFactReason, OrderFactState, OrderTimelineKind } from '../../domain/order/order-projection';
import { FulfillmentEligibility, OrderStatus, PaymentStatus } from '../../domain/order/commerce-states';
import { allowedRma, allowedShipment } from '../../domain/order/fulfillment-transition';
import { ReturnEligibility } from '../../domain/order/return-eligibility';

describe('Order projection HTTP boundary', () => {
  it('retains pending and incident blockers without exposing fulfillment commands', () => {
    for (const eligibility of [FulfillmentEligibility.OrderNotPaid, FulfillmentEligibility.ReversalOrIncident]) {
      for (const payment of [undefined, { state: OrderFactState.Known.wire, value: PaymentStatus.Pending.wire, reason: null }]) {
        const order = mapAdminOrder({ orderStatus: OrderStatus.PendingPayment.wire, paymentStatus: PaymentStatus.Pending.wire,
          payment, fulfillmentEligibility: eligibility.wire, shipmentAction: 'PACKED', rmaAction: 'RECEIVED' });
        expect(order.fulfillmentEligibility).toBe(eligibility);
        expect(order.shipmentAction).toBeNull();
        expect(order.rmaAction).toBeNull();
        expect(allowedShipment(order)).toBeNull();
        expect(allowedRma(order)).toBeNull();
      }
    }
  });
  it('translates each closed fact, reason and timeline kind exactly', () => {
    for (const type of [OrderFactState, OrderFactReason, OrderTimelineKind]) {
      for (const value of Object.values(type)) {
        if (value instanceof type) expect(type.fromWire(value.wire)).toBe(value);
      }
      for (const raw of ['future', null, undefined, 0, {}]) expect(type.fromWire(raw)).toBe(type.Unknown);
    }
  });
  it('discards values inside unavailable and unknown facts, including provider payloads', () => {
    const order = mapCustomerOrder({
      buyerName: { state: 'UNAVAILABLE', value: 'Invented buyer', reason: 'SOURCE_MISSING' },
      buyerEmail: { state: 'FUTURE', value: 'private@example.com', reason: 'FUTURE' },
      payment: { state: 'UNAVAILABLE', value: 'APPROVED', reason: 'SOURCE_CONTRADICTORY' },
      delivery: { state: 'UNAVAILABLE', value: { street: 'Invented address' } },
      timeline: { state: 'UNKNOWN', value: [{ kind: 'PAYMENT_ACCREDITED', actor: 'internal' }] },
      returnEligibility: 'future',
    });
    expect(order.buyerName.value).toBeNull();
    expect(order.buyerName.reason).toBe(OrderFactReason.SourceContradictory);
    expect(order.buyerEmail.value).toBeNull();
    expect(order.buyerEmail.state).toBe(OrderFactState.Unavailable);
    expect(order.payment.value).toBeNull();
    expect(order.delivery.value).toBeNull();
    expect(order.timeline.value).toBeNull();
    expect(order.returnEligibility).toBe(ReturnEligibility.PaymentUnverified);
  });
  it('preserves authoritative snapshots and safe timeline order without leaking extra properties', () => {
    const order = mapAdminOrder({
      payment: { state: 'KNOWN', value: 'APPROVED' },
      paymentStatus: 'APPROVED',
      delivery: { state: 'KNOWN', value: { recipient: null, street: 'Calle 123', city: null, province: null, postalCode: null, country: null, providerPayload: 'secret' } },
      timeline: { state: 'KNOWN', value: [
        { id: 'a', kind: 'ORDER_CREATED', occurredAt: '2026-11-08T10:00:00Z', actor: 'internal' },
        { id: 'b', kind: 'FUTURE', occurredAt: '2026-11-08T11:00:00Z', payload: 'secret' },
      ] },
      subtotal: 0, shippingCost: null,
    });
    expect(order.payment.value).toBe(PaymentStatus.Approved);
    expect(order.subtotal).toBe(0);
    expect(order.shippingCost).toBeNull();
    expect(order.delivery.value?.country).toBeNull();
    expect(order.timeline.value?.map((event) => event.id)).toEqual(['a', 'b']);
    expect(order.timeline.value?.[1]).toEqual({ id: 'b', kind: OrderTimelineKind.Unknown, occurredAt: '2026-11-08T11:00:00Z' });
    expect(JSON.stringify(order)).not.toMatch(/internal|secret|providerPayload|actor/);
  });
  it('rejects malformed known facts and contradictory state/value/reason combinations', () => {
    for (const fact of [
      { state: 'KNOWN', value: null, reason: null },
      { state: 'KNOWN', value: 12, reason: null },
      { state: 'KNOWN', value: 'Buyer', reason: 'SOURCE_MISSING' },
      { state: 'UNAVAILABLE', value: 'Buyer', reason: 'SOURCE_MISSING' },
      { state: 'UNAVAILABLE', value: null, reason: null },
      { state: 'UNAVAILABLE', value: null, reason: 'FUTURE_REASON' },
      { state: 'UNKNOWN', value: 'Buyer', reason: null },
      { state: 'UNKNOWN', value: null, reason: 'SOURCE_MISSING' },
    ]) {
      expect(mapCustomerOrder({ buyerName: fact }).buyerName).toEqual({ state: OrderFactState.Unavailable, value: null, reason: OrderFactReason.SourceContradictory });
    }
    expect(mapCustomerOrder({ delivery: { state: 'KNOWN', value: {} } }).delivery.state).toBe(OrderFactState.Unavailable);
    for (const event of [{ id: '', occurredAt: '2026-11-08T10:00:00Z' }, { id: 'event', occurredAt: 'invalid' }]) {
      expect(mapCustomerOrder({ timeline: { state: 'KNOWN', value: [event] } }).timeline.state).toBe(OrderFactState.Unavailable);
    }
    expect(mapCustomerOrder({ buyerName: { state: 'FUTURE', value: null } }).buyerName.state).toBe(OrderFactState.Unknown);
    expect(mapCustomerOrder({ buyerName: { state: 'UNAVAILABLE', value: null, reason: 'SOURCE_MISSING' } }).buyerName.reason).toBe(OrderFactReason.SourceMissing);
  });
  it('never lets contradictory payment facts or legacy authority produce paid UI or commands', () => {
    const legacy = { orderStatus: 'PAID', paymentStatus: 'APPROVED', shipmentStatus: 'DELIVERED', rmaStatus: 'NONE', fulfillmentEligibility: 'ELIGIBLE', shipmentAction: 'DELIVERED', rmaAction: 'RECEIVED', returnEligibility: 'ELIGIBLE' };
    for (const payment of [undefined,
      { state: 'KNOWN', value: 'APPROVED', reason: 'SOURCE_MISSING' },
      { state: 'KNOWN', value: 'REFUNDED', reason: null },
      { state: 'KNOWN', value: 'FUTURE_PAYMENT', reason: null },
      { state: 'UNAVAILABLE', value: 'APPROVED', reason: 'SOURCE_MISSING' },
      { state: 'UNAVAILABLE', value: null, reason: 'SOURCE_MISSING' },
      { state: 'UNKNOWN', value: 'APPROVED', reason: null },
      { state: 'UNKNOWN', value: null, reason: null },
    ]) {
      const order = mapAdminOrder({ ...legacy, payment });
      expect(order.payment.value).toBeNull();
      expect(order.paymentStatus).toBe(PaymentStatus.Unknown);
      expect(order.orderStatus).toBe(OrderStatus.Unknown);
      expect(order.returnEligibility).toBe(ReturnEligibility.PaymentUnverified);
      expect(order.fulfillmentEligibility).toBe(FulfillmentEligibility.PaymentNotVerified);
      expect(order.shipmentAction).toBeNull();
      expect(order.rmaAction).toBeNull();
      expect(allowedShipment(order)).toBeNull();
      expect(allowedRma(order)).toBeNull();
    }
    const reversedTopLevel = mapCustomerOrder({ ...legacy, paymentStatus: 'REFUNDED', payment: { state: 'KNOWN', value: 'APPROVED', reason: null } });
    expect(reversedTopLevel.payment.value).toBeNull();
    expect(reversedTopLevel.paymentStatus).toBe(PaymentStatus.Unknown);
    expect(reversedTopLevel.orderStatus).toBe(OrderStatus.Unknown);
    const valid = mapAdminOrder({ ...legacy, payment: { state: 'KNOWN', value: 'APPROVED', reason: null } });
    expect(valid.paymentStatus).toBe(PaymentStatus.Approved);
    expect(valid.orderStatus).toBe(OrderStatus.Paid);
    expect(allowedRma(valid)).not.toBeNull();
  });
  it('validates exact bounded metadata without inventing empty pages for legacy arrays', () => {
    const page = { items: [{ id: '1' }], page: 1, size: 25, total: 26, truncated: true };
    expect(mapOrderPage(page, mapCustomerOrder)).toMatchObject({ page: 1, size: 25, total: 26, truncated: true });
    for (const raw of [[], {}, { ...page, total: 1 }, { ...page, size: 51 }, { ...page, page: -1 }, { ...page, truncated: false }]) {
      expect(() => mapOrderPage(raw, mapCustomerOrder)).toThrow();
    }
  });
});
