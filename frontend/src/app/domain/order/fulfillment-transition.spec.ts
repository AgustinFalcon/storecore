import { nextRma, nextShipment } from './fulfillment-transition';

describe('fulfillment transitions', () => {
  it('does not skip shipment states', () => {
    expect(nextShipment('PENDING')).toBe('PACKED');
    expect(nextShipment('PACKED')).toBe('SHIPPED');
    expect(nextShipment('SHIPPED')).toBe('DELIVERED');
    expect(nextShipment('DELIVERED')).toBeNull();
  });

  it('does not restock before RMA is adjusted', () => {
    expect(nextRma(null)).toBe('RECEIVED');
    expect(nextRma('RECEIVED')).toBe('INSPECTED');
    expect(nextRma('INSPECTED')).toBe('ADJUSTED');
    expect(nextRma('ADJUSTED')).toBeNull();
  });
});
