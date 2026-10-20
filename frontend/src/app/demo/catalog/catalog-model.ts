import type { OutletScope, ProductCondition, ProductPublication, VariantSaleState } from './catalog-types';

/** Catalog owns these contracts; the application snapshot composes them at its boundary. */
export interface DemoProductMedia { id: string; src: string; alt: string; }
export interface DemoOutletDetails { scope: OutletScope; reference: string; notes: string; defects: string; warrantyTerms: string; media: DemoProductMedia[]; }
/** Variant identity is open catalog data, while its condition and sale state are closed types. */
export interface DemoProductVariantRecord { id: string; label: string; attributes: readonly { name: string; value: string }[]; price: number; original: number; onHand: number; reserved: number; notSellable: number; saleState: VariantSaleState; condition: ProductCondition; outlet: DemoOutletDetails | null; pickupLocation?: string; }
export interface DemoProduct { sku: string; name: string; category: string; brand: string; description: string; price: number; original: number; onHand: number; reserved: number; publication: ProductPublication; tone: string; variant: string; attributes: readonly { name: string; value: string }[]; media: readonly DemoProductMedia[]; variants: DemoProductVariantRecord[]; }
export interface DemoCatalogSnapshot { revision: number; products: DemoProduct[]; }
export interface DemoProductWriter {
  saveProduct(actorId: string, product: DemoProduct, editingSku?: string, expectedRevision?: number): void;
}
