import type { DemoProduct, DemoProductVariantRecord, DemoCatalogSnapshot } from './catalog-model';
import { ProductCondition } from './catalog-types';
import { DemoProductPolicy } from './product-policy';

/** Framework-free catalog read model used by the Demo application coordinator. */
export class DemoCatalogQuery {
  constructor(
    private readonly snapshot: () => DemoCatalogSnapshot,
    private readonly quote: (product: DemoProduct, variant: DemoProductVariantRecord, available: boolean) => { amount: number } = (_product, variant) => ({ amount: variant.price }),
  ) {}

  product(sku: string): DemoProduct {
    const product = this.snapshot().products.find(value => value.sku === sku);
    if (!product) throw new Error('Producto no encontrado.');
    return product;
  }

  variant(sku: string, variantId: string): DemoProductVariantRecord {
    if (typeof variantId !== 'string' || !variantId.trim()) throw new Error('Seleccioná una variante válida.');
    const variant = this.product(sku).variants.find(value => value.id === variantId);
    if (!variant) throw new Error('La variante seleccionada ya no está disponible. Actualizá la página y elegí otra opción.');
    return variant;
  }

  refreshTotals(product: DemoProduct): void {
    DemoProductPolicy.refreshTotals(product);
  }

  available(sku: string, variantId?: string): number {
    const product = this.product(sku);
    const selected = variantId === undefined ? undefined : this.variant(sku, variantId);
    if (!product.publication.published || !DemoProductPolicy.known(product)) return 0;
    const available = (variant: DemoProductVariantRecord): number =>
      variant.saleState.active && variant.condition !== ProductCondition.Unknown
        ? variant.onHand - variant.reserved - variant.notSellable
        : 0;
    return selected
      ? available(selected)
      : product.variants.reduce((sum, variant) => sum + available(variant), 0);
  }

  priceQuote(sku: string, variantId?: string) {
    const product = this.product(sku);
    const variant = variantId !== undefined
      ? this.variant(sku, variantId)
      : product.variants.filter(value => value.saleState.active).reduce<DemoProductVariantRecord | undefined>((minimum, value) => !minimum || value.price < minimum.price ? value : minimum, undefined);
    if (!variant) return { amount: 0 };
    return this.quote(product, variant, this.available(sku, variant.id) > 0);
  }

  price(sku: string, variantId?: string): number {
    return this.priceQuote(sku, variantId).amount;
  }
}
