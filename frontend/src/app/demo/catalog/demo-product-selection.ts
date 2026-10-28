import { DemoProductVariant } from '../demo-model';
import type { CatalogQueryReader } from './demo-catalog-location';

/** Sole URL translator for a product selection; invalid input is never purchased. */
export class DemoProductSelection {
  private constructor(readonly variant: DemoProductVariant, readonly quantity: number) {}

  static fromWire(query: CatalogQueryReader, variants: readonly DemoProductVariant[], available: number): DemoProductSelection {
    const rawVariant = query.get('variant');
    const requested = rawVariant === null ? variants[0]??DemoProductVariant.Unknown : DemoProductVariant.fromWire(rawVariant);
    const variant = variants.includes(requested) ? requested : DemoProductVariant.Unknown;
    const rawQuantity = query.get('quantity');
    const quantity = rawQuantity === null ? 1 : /^\d+$/.test(rawQuantity) ? Number(rawQuantity) : Number.NaN;
    return new DemoProductSelection(variant, Number.isSafeInteger(quantity) && quantity > 0 && (rawQuantity === null || quantity <= available) ? quantity : Number.NaN);
  }
}
