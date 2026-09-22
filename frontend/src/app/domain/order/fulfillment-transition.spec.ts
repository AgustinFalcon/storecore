import { nextRma, nextShipment } from './fulfillment-transition';

describe('fulfillment transitions', () => {
  it('does not skip shipment states', () => {
    expect(nextShipment('PENDING')).toBe('PACKED');
    expect(nextShipment('PREPARING')).toBe('SHIPPED');
    expect(nextShipment('SHIPPED')).toBe('DELIVERED');
    expect(nextShipment('DELIVERED')).toBeNull();
  });

  it('does not restock before RMA is adjusted', () => {
    expect(nextRma(null)).toBe('RECEIVED');
    expect(nextRma('RETURN_RECEIVED')).toBe('INSPECTED');
    expect(nextRma('INSPECTED')).toBe('ADJUSTED');
    expect(nextRma('CLOSED')).toBeNull();
  });
});
