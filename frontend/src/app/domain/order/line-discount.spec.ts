import { hasRealLineDiscount } from './line-discount';

describe('order line discount', () => {
  it('accepts a snapshot line only when the discount is positive and the original is higher', () => {
    expect(hasRealLineDiscount({ originalUnitPrice: 100, discountAmount: 20, effectiveUnitPrice: 80 })).toBe(true);
  });

  it('rejects a zero discount even when the original is higher', () => {
    expect(hasRealLineDiscount({ originalUnitPrice: 100, discountAmount: 0, effectiveUnitPrice: 80 })).toBe(false);
  });

  it('rejects an original that is not greater than the effective price', () => {
    expect(hasRealLineDiscount({ originalUnitPrice: 80, discountAmount: 15, effectiveUnitPrice: 80 })).toBe(false);
    expect(hasRealLineDiscount({ originalUnitPrice: 70, discountAmount: 15, effectiveUnitPrice: 80 })).toBe(false);
  });

  it('rejects a missing price or discount instead of inventing one', () => {
    expect(hasRealLineDiscount({ originalUnitPrice: 100, effectiveUnitPrice: 80 })).toBe(false);
    expect(hasRealLineDiscount({ discountAmount: 20, effectiveUnitPrice: 80 })).toBe(false);
    expect(hasRealLineDiscount({ originalUnitPrice: 100, discountAmount: 20 })).toBe(false);
    expect(hasRealLineDiscount({ originalUnitPrice: null, discountAmount: 20, effectiveUnitPrice: 80 })).toBe(false);
    expect(hasRealLineDiscount({ originalUnitPrice: Number.NaN, discountAmount: 20, effectiveUnitPrice: 80 })).toBe(false);
  });
});
