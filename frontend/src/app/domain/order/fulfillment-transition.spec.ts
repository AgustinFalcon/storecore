import { nextRma, nextShipment } from './fulfillment-transition';
import { RmaStatus, RmaTransition } from './rma-status';
import { ShipmentStatus, ShipmentTransition } from './shipment-status';

describe('fulfillment transitions', () => {
  it('does not expose transitions for unknown domain states or wire values', () => {
    expect(nextShipment(ShipmentStatus.Unknown)).toBeNull();
    expect(nextShipment('IN_TRANSIT')).toBeNull();
    expect(nextRma(RmaStatus.Unknown)).toBeNull();
    expect(nextRma('RESTOCKED')).toBeNull();
  });

  it('does not skip shipment states', () => {
    expect(nextShipment('PENDING')).toBe(ShipmentTransition.Packed);
    expect(nextShipment('PREPARING')).toBe(ShipmentTransition.Shipped);
    expect(nextShipment('SHIPPED')).toBe(ShipmentTransition.Delivered);
    expect(nextShipment('DELIVERED')).toBeNull();
  });

  it('does not restock before RMA is adjusted', () => {
    expect(nextRma(null)).toBe(RmaTransition.Received);
    expect(nextRma('RETURN_RECEIVED')).toBe(RmaTransition.Inspected);
    expect(nextRma('INSPECTED')).toBe(RmaTransition.Adjusted);
    expect(nextRma('CLOSED')).toBeNull();
  });
});
