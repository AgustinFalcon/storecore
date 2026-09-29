import { RmaStatus, ShipmentStatus } from './closed-status';
import { nextRma, nextShipment } from './fulfillment-transition';

describe('fulfillment transitions', () => {
  it('does not skip shipment states', () => {
    expect(nextShipment(ShipmentStatus.Pending)).toBe(ShipmentStatus.Packed);
    expect(nextShipment(ShipmentStatus.Preparing)).toBe(ShipmentStatus.Shipped);
    expect(nextShipment(ShipmentStatus.Shipped)).toBe(ShipmentStatus.Delivered);
    expect(nextShipment(ShipmentStatus.Delivered)).toBeNull();
    expect(nextShipment(ShipmentStatus.Unknown)).toBeNull();
  });

  it('does not restock before RMA is adjusted', () => {
    expect(nextRma(null)).toBe(RmaStatus.Received);
    expect(nextRma(RmaStatus.ReturnReceived)).toBe(RmaStatus.Inspected);
    expect(nextRma(RmaStatus.Inspected)).toBe(RmaStatus.Adjusted);
    expect(nextRma(RmaStatus.Closed)).toBeNull();
  });
});
