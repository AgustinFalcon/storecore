import { InventoryAvailability } from '../user/inventory-availability';
import { ProductDetail } from './product-detail.entity';
import { ProductStatus, VariantStatus } from './catalog-states';
import { VariantPricePolicy, VariantPriceCommand } from './variant-price';

export class CatalogEditorMode {
  private constructor(readonly wire: string, readonly label: string, readonly canCreate: boolean) {}
  static readonly Create = new CatalogEditorMode('CREATE', 'Nuevo producto', true);
  static readonly Edit = new CatalogEditorMode('EDIT', 'Editar producto', false);
  static readonly Unknown = new CatalogEditorMode('UNKNOWN', 'Modo no reconocido', false);
  static readonly values = [this.Create, this.Edit, this.Unknown];
  static fromWire(raw: unknown): CatalogEditorMode { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

export interface CatalogVariantDraft {
  readonly pricePolicy: VariantPricePolicy;
  readonly basePriceOverride: number | null;
  readonly priceCommand: VariantPriceCommand;
  readonly priceInput: number | null;
  readonly priceInputRaw: string;
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly status: VariantStatus;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly initialAvailableQuantity: number | null;
  readonly availability: InventoryAvailability;
}

export interface CatalogProductDraft {
  readonly productBasePrice: number | null;
  readonly productBasePriceRaw: string;
  readonly mode: CatalogEditorMode;
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly brand: string;
  readonly category: string;
  readonly images: readonly string[];
  readonly variants: readonly CatalogVariantDraft[];
  readonly status: ProductStatus;
}

export function newCatalogVariant(sku = ''): CatalogVariantDraft {
  return { id: '', sku, name: '', status: VariantStatus.Active, attributes: {}, initialAvailableQuantity: 0, availability: InventoryAvailability.Unavailable,
    pricePolicy: VariantPricePolicy.Inherited, basePriceOverride: null, priceCommand: VariantPriceCommand.Inherit, priceInput: null, priceInputRaw: '' };
}

export function newCatalogProductDraft(): CatalogProductDraft {
  return {
    mode: CatalogEditorMode.Create, id: '', sku: '', name: '', description: '', brand: '', category: '', images: [],
    variants: [newCatalogVariant()], productBasePrice: 0, productBasePriceRaw: '0', status: ProductStatus.Draft,
  };
}

export function catalogProductDraftFromDetail(product: ProductDetail): CatalogProductDraft {
  return {
    mode: CatalogEditorMode.Edit, id: product.id, sku: product.sku, name: product.name, description: product.description,
    brand: product.brand, category: product.category, images: product.images, productBasePrice: product.productBasePrice,
    productBasePriceRaw: product.productBasePrice === null ? '' : String(product.productBasePrice),
    status: product.status,
    variants: product.variants.map(variant => ({
      id: variant.id, sku: variant.sku, name: variant.name, status: variant.status, attributes: variant.attributes,
      initialAvailableQuantity: null, availability: variant.availability,
      pricePolicy: variant.pricePolicy, basePriceOverride: variant.basePriceOverride, priceCommand: VariantPriceCommand.Preserve, priceInput: variant.basePriceOverride,
      priceInputRaw: variant.basePriceOverride === null ? '' : String(variant.basePriceOverride),
    })),
  };
}
