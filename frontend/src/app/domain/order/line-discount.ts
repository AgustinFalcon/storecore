export interface OrderLinePrice {
  readonly originalUnitPrice?: number | null;
  readonly discountAmount?: number | null;
  readonly effectiveUnitPrice?: number | null;
}

export function hasRealLineDiscount(line: OrderLinePrice): boolean {
  const original = line.originalUnitPrice;
  const discount = line.discountAmount;
  const effective = line.effectiveUnitPrice;
  if (typeof original !== 'number' || typeof discount !== 'number' || typeof effective !== 'number') {
    return false;
  }
  if (!Number.isFinite(original) || !Number.isFinite(discount) || !Number.isFinite(effective)) {
    return false;
  }
  return discount > 0 && original > effective;
}
