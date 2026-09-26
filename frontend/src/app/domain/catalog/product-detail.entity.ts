export interface ProductPrice {
  readonly base: number;
  readonly desired: number | null;
  readonly observed: number | null;
  readonly effective: number;
  readonly priceVersion: string;
}

export interface ProductVariant {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly availableQuantity: number;
}

export interface ProductDetail {
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly brand: string;
  readonly category: string;
  readonly images: readonly string[];
  readonly variants: readonly ProductVariant[];
  readonly price: ProductPrice;
  readonly offerRef: string | null;
  readonly active: boolean;
  /** Offer window from the detail payload. Absent means do not hide an API offer. */
  readonly validFrom?: string | null;
  readonly validUntil?: string | null;
}
