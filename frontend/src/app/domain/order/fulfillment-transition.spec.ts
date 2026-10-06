import { allowedRma, allowedShipment, nextRma, nextShipment } from './fulfillment-transition';
import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from './commerce-states';
import { AdminOrder } from './order.entity';

const order: AdminOrder = { id: '1', orderStatus: OrderStatus.Paid, paymentStatus: PaymentStatus.Approved, shipmentStatus: ShipmentStatus.Pending, tracking: null, total: 100, lines: [], rmaStatus: RmaStatus.None, fulfillmentEligibility: FulfillmentEligibility.Eligible, shipmentAction: ShipmentTransition.Packed, rmaAction: null };

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
    expect(allowedShipment(order)).toBe(ShipmentTransition.Packed);
    expect(allowedShipment({ ...order, shipmentAction: null })).toBeNull();
    expect(allowedShipment({ ...order, shipmentAction: ShipmentTransition.Delivered })).toBeNull();
    expect(allowedShipment({ ...order, fulfillmentEligibility: FulfillmentEligibility.Unknown })).toBeNull();
    expect(allowedShipment({ ...order, orderStatus: OrderStatus.PendingPayment })).toBeNull();
    expect(allowedShipment({ ...order, paymentStatus: PaymentStatus.Pending })).toBeNull();
    expect(allowedShipment({ ...order, rmaStatus: RmaStatus.Unknown })).toBeNull();
    expect(allowedRma({ ...order, shipmentStatus: ShipmentStatus.Delivered, rmaStatus: RmaStatus.Unknown, rmaAction: RmaTransition.Received })).toBeNull();
    expect(allowedRma({ ...order, rmaAction: RmaTransition.Received })).toBeNull();
    expect(allowedRma({ ...order, shipmentStatus: ShipmentStatus.Delivered, rmaAction: RmaTransition.Received })).toBe(RmaTransition.Received);
    expect(allowedRma({ ...order, shipmentStatus: ShipmentStatus.Delivered, rmaStatus: RmaStatus.Inspected, rmaAction: RmaTransition.Adjusted })).toBeNull();
  });
});
