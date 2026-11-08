import { ProductStatus, VariantStatus } from './catalog-states';
import { InventoryAvailability } from '../user/inventory-availability';
import type { InventoryRow } from '../user/user.entity';

export interface ProductPrice {
  readonly base: number;
  readonly original: number;
  readonly effective: number;
  readonly offer: { readonly id: string; readonly name: string } | null;
}
export interface ProductMedia { readonly id: string; readonly url: string; readonly sortOrder: number; readonly primary: boolean; }
export interface ProductVariant {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly status: VariantStatus;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly availableQuantity: number | null;
  readonly availability: InventoryAvailability;
  readonly inventory: InventoryRow;
}
export interface ProductDetail {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly brand: string;
  readonly category: string;
  readonly images: readonly string[];
  readonly media: readonly ProductMedia[];
  readonly variants: readonly ProductVariant[];
  readonly price: ProductPrice;
  readonly offerRef: string | null;
  readonly status: ProductStatus;
  readonly active: boolean;
}
