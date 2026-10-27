import { InventoryAvailability } from './inventory-availability';

describe('InventoryAvailability', () => {
  it('derives availability without subtracting reservations or safety', () => {
    expect(InventoryAvailability.fromQuantities(8, 20, 3)).toBe(InventoryAvailability.Normal);
    expect(InventoryAvailability.fromQuantities(3, 20, 3)).toBe(InventoryAvailability.Low);
    expect(InventoryAvailability.fromQuantities(0, 20, 3)).toBe(InventoryAvailability.Out);
  });

  it('fails closed when any quantity is unknown or invalid', () => {
    for (const value of [null, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(InventoryAvailability.fromQuantities(value, 0, 0)).toBe(InventoryAvailability.Unknown);
      expect(InventoryAvailability.fromQuantities(4, value, 0)).toBe(InventoryAvailability.Unknown);
      expect(InventoryAvailability.fromQuantities(4, 0, value)).toBe(InventoryAvailability.Unknown);
    }
  });

  it('translates only exact known values and owns presentation', () => {
    for (const state of [InventoryAvailability.Normal, InventoryAvailability.Low, InventoryAvailability.Out, InventoryAvailability.Unknown]) {
      expect(InventoryAvailability.fromWire(state.wire)).toBe(state);
      expect(state.label.length).toBeGreaterThan(0);
    }
    expect(InventoryAvailability.fromWire('normal')).toBe(InventoryAvailability.Unknown);
    expect(InventoryAvailability.fromWire(null)).toBe(InventoryAvailability.Unknown);
  });
});
