import { CatalogEditorMode, catalogProductDraftFromDetail, newCatalogProductDraft } from './catalog-product-draft';
import { ProductStatus, VariantStatus, InventoryState } from './catalog-states';
import { InventoryAvailability } from '../user/inventory-availability';
import { ProductDetail } from './product-detail.entity';

describe('catalog product draft', () => {
  it('uses a closed editor mode with Unknown at the wire boundary', () => {
    expect(CatalogEditorMode.fromWire('CREATE')).toBe(CatalogEditorMode.Create);
    expect(CatalogEditorMode.fromWire('future')).toBe(CatalogEditorMode.Unknown);
  });

  it('separates a new write draft from a persisted read projection', () => {
    const created = newCatalogProductDraft();
    expect(created.mode).toBe(CatalogEditorMode.Create);
    expect(created.variants).toEqual([expect.objectContaining({ id: '', initialAvailableQuantity: 0 })]);
    const detail: ProductDetail = {
      id: 'p', sku: 'SKU', name: 'Producto', description: '', brand: '', category: '', images: [], media: [], offerRef: null,
      price: { base: 10, original: 10, effective: 10, offer: null }, status: ProductStatus.Active, active: true,
      variants: [{ id: 'v', sku: 'SKU', name: 'Principal', status: VariantStatus.Active, attributes: {}, availableQuantity: 3, availability: InventoryAvailability.Normal,
        inventory: { variantId: 'v', productName: 'Producto', variantLabel: 'Principal', onHand: 3, saleable: 3, updatedAt: null, state: InventoryState.Known, sku: 'SKU', availableQuantity: 3, reservedQuantity: 0, safetyStock: 0, availability: InventoryAvailability.Normal } }],
    };
    const edited = catalogProductDraftFromDetail(detail);
    expect(edited.mode).toBe(CatalogEditorMode.Edit);
    expect(edited.variants[0].initialAvailableQuantity).toBeNull();
  });
});
