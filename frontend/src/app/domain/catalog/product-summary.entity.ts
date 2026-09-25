/** Framework-free catalog shape. No SKU, price or merchant is hardcoded. */
export interface ProductSummary {
  readonly sku: string;
  readonly name: string;
  /** Price the storefront can sell. Never substitute base or observed price. */
  readonly price: number;
  /** Displayed only when the API supplies a real discount. */
  readonly originalPrice: number | null;
  /** Optional media supplied by the catalog; no browser-side product fixtures. */
  readonly imageUrl: string | null;
  readonly offerRef: string | null;
}
