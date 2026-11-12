import { InventoryAvailability } from '../user/inventory-availability';
import { ProductDetail, ProductPrice } from './product-detail.entity';
import { ProductStatus, VariantStatus } from './catalog-states';

export class CatalogEditorMode {
  private constructor(readonly wire: string, readonly label: string, readonly canCreate: boolean) {}
  static readonly Create = new CatalogEditorMode('CREATE', 'Nuevo producto', true);
  static readonly Edit = new CatalogEditorMode('EDIT', 'Editar producto', false);
  static readonly Unknown = new CatalogEditorMode('UNKNOWN', 'Modo no reconocido', false);
  static readonly values = [this.Create, this.Edit, this.Unknown];
  static fromWire(raw: unknown): CatalogEditorMode { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

export interface CatalogVariantDraft {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly status: VariantStatus;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly initialAvailableQuantity: number | null;
  readonly availability: InventoryAvailability;
}

export interface CatalogProductDraft {
  readonly mode: CatalogEditorMode;
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly brand: string;
  readonly category: string;
  readonly images: readonly string[];
  readonly variants: readonly CatalogVariantDraft[];
  readonly price: ProductPrice;
  readonly status: ProductStatus;
}

export function newCatalogVariant(sku = ''): CatalogVariantDraft {
  return { id: '', sku, name: '', status: VariantStatus.Active, attributes: {}, initialAvailableQuantity: 0, availability: InventoryAvailability.Unavailable };
}

export function newCatalogProductDraft(): CatalogProductDraft {
  return {
    mode: CatalogEditorMode.Create, id: '', sku: '', name: '', description: '', brand: '', category: '', images: [],
    variants: [newCatalogVariant()], price: { base: 0, original: 0, effective: 0, offer: null }, status: ProductStatus.Draft,
  };
}

export function catalogProductDraftFromDetail(product: ProductDetail): CatalogProductDraft {
  return {
    mode: CatalogEditorMode.Edit, id: product.id, sku: product.sku, name: product.name, description: product.description,
    brand: product.brand, category: product.category, images: product.images, price: product.price, status: product.status,
    variants: product.variants.map(variant => ({
      id: variant.id, sku: variant.sku, name: variant.name, status: variant.status, attributes: variant.attributes,
      initialAvailableQuantity: null, availability: variant.availability,
    })),
  };
}
