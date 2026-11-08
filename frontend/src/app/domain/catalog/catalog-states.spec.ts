import { InventoryState, ProductStatus, VariantStatus } from './catalog-states';

describe('closed catalog states', () => {
  it('round trips every known case and keeps unknown values closed', () => {
    for (const type of [ProductStatus, VariantStatus, InventoryState]) {
      for (const value of type.values) {
        expect(type.fromWire(value.wire)).toBe(value);
        expect(value.label).toBeTruthy();
      }
      for (const raw of [null, undefined, 'future-state', {}, 0]) expect(type.fromWire(raw)).toBe(type.Unknown);
    }
    expect(ProductStatus.Unknown.isPublic).toBe(false);
    expect(VariantStatus.Unknown.isPublic).toBe(false);
  });
});
