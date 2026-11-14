import { DeliveryDecision } from '../cart/delivery';
import { allowedRma, allowedShipment, nextRma, nextShipment } from './fulfillment-transition';
import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from './commerce-states';
import { AdminOrder } from './order.entity';
import { OrderFactReason, OrderFactState } from './order-projection';
import { ReturnEligibility } from './return-eligibility';

const unavailable = { state: OrderFactState.Unavailable, value: null, reason: null };
const approved = { state: OrderFactState.Known, value: PaymentStatus.Approved, reason: null };
const order: AdminOrder = { deliveryDecision: DeliveryDecision.fromWire({state:'LEGACY_MISSING_BLOCK',value:null}), orderNumber: null, createdAt: null, updatedAt: null, currency: null, subtotal: null, shippingCost: null, buyerName: unavailable, buyerEmail: unavailable, delivery: unavailable, payment: approved, timeline: unavailable, returnEligibility: ReturnEligibility.Unavailable, id: '1', orderStatus: OrderStatus.Paid, paymentStatus: PaymentStatus.Approved, shipmentStatus: ShipmentStatus.Pending, tracking: null, total: 100, lines: [], rmaStatus: RmaStatus.None, fulfillmentEligibility: FulfillmentEligibility.Eligible, shipmentAction: ShipmentTransition.Packed, rmaAction: null };

describe('fulfillment policy', () => {
  it('orders shipment steps and blocks terminal or unknown states', () => {
    expect(nextShipment(ShipmentStatus.NotCreated)).toBe(ShipmentTransition.Packed);
    expect(nextShipment(ShipmentStatus.Pending)).toBe(ShipmentTransition.Packed);
    expect(nextShipment(ShipmentStatus.Preparing)).toBe(ShipmentTransition.Shipped);
    expect(nextShipment(ShipmentStatus.Shipped)).toBe(ShipmentTransition.Delivered);
    for (const status of [ShipmentStatus.Delivered, ShipmentStatus.Cancelled, ShipmentStatus.Unknown]) expect(nextShipment(status)).toBeNull();
  });
  it('supports reception once and never offers inspection or stock adjustment', () => {
    expect(nextRma(RmaStatus.None)).toBe(RmaTransition.Received);
    for (const status of [RmaStatus.Requested, RmaStatus.Approved, RmaStatus.ReturnReceived, RmaStatus.Inspected, RmaStatus.Rejected, RmaStatus.Closed, RmaStatus.Unknown]) expect(nextRma(status)).toBeNull();
  });
  it('requires authoritative eligibility and the exact allowed command', () => {
    expect(allowedShipment({ ...order, payment: approved })).toBe(ShipmentTransition.Packed);
    expect(allowedShipment({ ...order, shipmentAction: null })).toBeNull();
    expect(allowedShipment({ ...order, shipmentAction: ShipmentTransition.Delivered })).toBeNull();
    expect(allowedShipment({ ...order, fulfillmentEligibility: FulfillmentEligibility.Unknown })).toBeNull();
    expect(allowedShipment({ ...order, orderStatus: OrderStatus.PendingPayment })).toBeNull();
    expect(allowedShipment({ ...order, paymentStatus: PaymentStatus.Pending })).toBeNull();
    expect(allowedShipment({ ...order, rmaStatus: RmaStatus.Unknown })).toBeNull();
    expect(allowedRma({ ...order, shipmentStatus: ShipmentStatus.Delivered, rmaStatus: RmaStatus.Unknown, rmaAction: RmaTransition.Received })).toBeNull();
    expect(allowedRma({ ...order, rmaAction: RmaTransition.Received })).toBeNull();
    expect(allowedRma({ ...order, payment: approved, shipmentStatus: ShipmentStatus.Delivered, rmaAction: RmaTransition.Received })).toBe(RmaTransition.Received);
    expect(allowedRma({ ...order, shipmentStatus: ShipmentStatus.Delivered, rmaStatus: RmaStatus.Inspected, rmaAction: RmaTransition.Adjusted })).toBeNull();
  });
  it('blocks shipment and return commands for missing, unknown, reversed or contradictory payment facts despite legacy permission', () => {
    for (const payment of [unavailable, { state: OrderFactState.Unknown, value: null, reason: null },
      { ...approved, state: OrderFactState.Unavailable }, { ...approved, value: PaymentStatus.Refunded },
      { ...approved, value: PaymentStatus.Unknown }, { ...approved, reason: OrderFactReason.SourceContradictory }]) {
      expect(allowedShipment({ ...order, payment })).toBeNull();
      expect(allowedRma({ ...order, payment, shipmentStatus: ShipmentStatus.Delivered, rmaAction: RmaTransition.Received })).toBeNull();
    }
  });
});
