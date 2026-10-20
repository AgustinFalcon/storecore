import type { DemoProduct, DemoProductVariantRecord } from '../catalog/catalog-model';
import { DemoCatalogQuery } from '../catalog/demo-catalog-query';
import { DemoProductPolicy } from '../catalog/product-policy';
import { DemoReturnDisposition, demoReturnLineKey, type DemoReturnLine } from './postsale-types';

export interface DemoReturnInventoryEntry {
  readonly line: DemoReturnLine;
  readonly product: DemoProduct;
  readonly variant: DemoProductVariantRecord;
}

/** Resolves and proves the complete post-disposal catalog state without mutating durable objects. */
export class DemoReturnInventoryProjection {
  constructor(private readonly catalog: DemoCatalogQuery) {}

  prepare(lines: readonly DemoReturnLine[], dispositions: ReadonlyMap<string, DemoReturnDisposition>): readonly DemoReturnInventoryEntry[] {
    const inventory = lines.map(line => ({ line, product: this.catalog.product(line.sku), variant: this.catalog.variant(line.sku, line.variantId) }));
    if (inventory.some(({ product, variant }) => !DemoProductPolicy.knownProduct(product) || !DemoProductPolicy.knownVariant(variant))) throw new Error('El producto o la variante necesitan conciliación antes de disponer inventario.');

    const products = new Map<string, DemoProduct>();
    for (const { line, product } of inventory) {
      const projected = products.get(product.sku) ?? DemoProductPolicy.clone(product);
      products.set(product.sku, projected);
      const variant = projected.variants.find(value => value.id === line.variantId)!;
      const disposition = dispositions.get(demoReturnLineKey(line))!;
      variant.onHand += line.quantity;
      if (disposition === DemoReturnDisposition.Damaged) variant.notSellable += line.quantity;
    }
    for (const product of products.values()) {
      this.catalog.refreshTotals(product);
      DemoProductPolicy.validate(product);
    }
    return inventory;
  }
}
