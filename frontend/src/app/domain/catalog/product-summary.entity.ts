/** Framework-free catalog shape. No SKU, price or merchant is hardcoded. */
export interface ProductSummary {
  readonly sku: string;
  readonly name: string;
  readonly price: number;
}
