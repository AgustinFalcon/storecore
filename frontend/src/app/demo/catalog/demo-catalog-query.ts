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
    const variant = this.product(sku).variants.find(value => value.id === variantId);
    if (!variant) throw new Error('La variante seleccionada ya no está disponible. Actualizá la página y elegí otra opción.');
    return variant;
  }

  refreshTotals(product: DemoProduct): void {
    const active = product.variants.filter(value => value.saleState.active);
    product.onHand = product.variants.reduce((sum, value) => sum + value.onHand, 0);
    product.reserved = product.variants.reduce((sum, value) => sum + value.reserved, 0);
    product.price = active.length ? Math.min(...active.map(value => value.price)) : 0;
    product.original = active.length ? Math.min(...active.map(value => value.original)) : 0;
  }

  available(sku: string, variantId?: string): number {
    const product = this.product(sku);
    if (!product.publication.published || !DemoProductPolicy.known(product)) return 0;
    const available = (variant: DemoProductVariantRecord): number =>
      variant.saleState.active && variant.condition !== ProductCondition.Unknown
        ? variant.onHand - variant.reserved - variant.notSellable
        : 0;
    return variantId
      ? available(this.variant(sku, variantId))
      : product.variants.reduce((sum, variant) => sum + available(variant), 0);
  }

  priceQuote(sku: string, variantId?: string) {
    const product = this.product(sku);
    const variant = variantId
      ? this.variant(sku, variantId)
      : product.variants.find(value => value.saleState.active) ?? product.variants[0];
    return this.quote(product, variant, this.available(sku, variant.id) > 0);
  }

  price(sku: string, variantId?: string): number {
    return this.priceQuote(sku, variantId).amount;
  }
}
