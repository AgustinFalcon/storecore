import { ShipmentStatus, ShipmentTransition } from './shipment-status';

describe('ShipmentStatus', () => {
  it('owns the next one-step transition', () => {
    expect(ShipmentStatus.fromWire('PENDING').next).toBe(ShipmentTransition.Packed);
    expect(ShipmentStatus.fromWire('PREPARING').next).toBe(ShipmentTransition.Shipped);
    expect(ShipmentStatus.fromWire('SHIPPED').next).toBe(ShipmentTransition.Delivered);
    expect(ShipmentStatus.fromWire('DELIVERED').next).toBeNull();
  });

  it('does not treat an unknown wire as a valid shipment state', () => {
    const status = ShipmentStatus.fromWire('IN_TRANSIT');
    expect(status).toBe(ShipmentStatus.Unknown);
    expect(status.label).toBe('Estado de envío no reconocido');
    expect(status.next).toBeNull();
  });

  it.each([null, undefined, '', '   ', 'PACKED', 'IN_TRANSIT'])('fails closed for wire %s', (wire) => {
    const status = ShipmentStatus.fromWire(wire);
    expect(status).toBe(ShipmentStatus.Unknown);
    expect(status.next).toBeNull();
  });
});

describe('ShipmentTransition', () => {
  it('keeps the tracking rule on the type', () => {
    expect(ShipmentTransition.fromWire('SHIPPED')).toBe(ShipmentTransition.Shipped);
    expect(ShipmentTransition.Shipped.requiresTracking).toBe(true);
    expect(ShipmentTransition.Packed.requiresTracking).toBe(false);
  });
});
