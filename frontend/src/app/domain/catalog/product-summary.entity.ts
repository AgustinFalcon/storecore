/** Framework-free catalog shape. No SKU, price or merchant is hardcoded. */
import { CatalogPricePresentation } from './variant-price';
import type { ProductDetail } from './product-detail.entity';
export interface ProductSummary {
  readonly presentation?: CatalogPricePresentation;
  readonly destinationSku?: string;
  readonly sku: string;
  readonly name: string;
  /** Price the storefront can sell. Never substitute base or observed price. */
  readonly price: number | null;
  /** Displayed only when the API supplies a real discount. */
  readonly originalPrice: number | null;
  /** Optional media supplied by the catalog; no browser-side product fixtures. */
  readonly imageUrl: string | null;
  readonly offerRef: string | null;
}

export function summarizeProduct(product: ProductDetail, referenceSku = product.sku): ProductSummary {
  const presentation = CatalogPricePresentation.fromVariants(product.variants);
  return { sku: referenceSku, destinationSku: presentation.sku ?? referenceSku, name: product.name,
    price: presentation.quote?.effective ?? null, originalPrice: presentation.original,
    imageUrl: product.images[0] ?? null, offerRef: presentation.quote?.offer?.id ?? null, presentation };
}
