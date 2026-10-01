import { nextRma, nextShipment } from './fulfillment-transition';
import { RmaTransition } from './rma-status';
import { ShipmentTransition } from './shipment-status';

describe('fulfillment transitions', () => {
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
