import type { DemoProduct, DemoProductVariantRecord, DemoProductMedia } from './catalog-model';
import { CatalogValidationError, OutletScope, ProductCondition, ProductPublication, VariantSaleState } from './catalog-types';

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const unique = (values: readonly { id: string }[]): boolean => new Set(values.map(value => value.id)).size === values.length;

/** Shared invariants: commands and persisted snapshots run the same checks. */
export class DemoProductPolicy {
  static media(items: readonly DemoProductMedia[]): boolean {
    return Array.isArray(items) && items.length > 0 && unique(items) && items.every(item => text(item.id) && text(item.alt) && /^\/assets\/demo\/[A-Za-z0-9_-]+\.(?:svg|jpg|png|webp)$/.test(item.src));
  }
  static variant(variant: DemoProductVariantRecord, allowUnknown = false): void {
    if (!text(variant.id) || !text(variant.label) || !integer(variant.price) || variant.price <= 0 || !integer(variant.original) || variant.original < variant.price || !integer(variant.onHand) || !integer(variant.reserved) || !integer(variant.notSellable) || variant.reserved + variant.notSellable > variant.onHand || !Array.isArray(variant.attributes) || variant.attributes.some(attribute => !text(attribute.name) || !text(attribute.value))) throw new CatalogValidationError('Cada variante necesita identidad, nombre, precios válidos (lista ≥ base) y stock entero: reservado + no vendible ≤ físico.');
    if (variant.pickupLocation !== undefined && !text(variant.pickupLocation)) throw new CatalogValidationError('La ubicación de retiro debe ser un texto no vacío cuando la variante ofrece retiro.');
    if (!allowUnknown && (variant.saleState === VariantSaleState.Unknown || variant.condition === ProductCondition.Unknown)) throw new CatalogValidationError('La variante tiene un estado o condición desconocidos.');
    if (variant.condition === ProductCondition.Outlet) {
      const outlet = variant.outlet;
      if (!outlet || (!allowUnknown && outlet.scope === OutletScope.Unknown) || !text(outlet.reference) || !text(outlet.notes) || !text(outlet.defects) || !text(outlet.warrantyTerms) || !this.media(outlet.media) || (outlet.scope !== OutletScope.Unknown && variant.onHand > outlet.scope.maximumUnits)) throw new CatalogValidationError('Outlet requiere unidad/lote identificado, condición, defectos, garantía y sus propias imágenes. Una unidad no puede tener más de una existencia.');
    } else if (variant.outlet !== null && !(allowUnknown && variant.condition === ProductCondition.Unknown)) throw new CatalogValidationError('La información Outlet sólo corresponde a una unidad o lote Outlet.');
  }
  static knownProduct(product: DemoProduct): boolean { return product.publication !== ProductPublication.Unknown; }
  static knownVariant(variant: DemoProductVariantRecord): boolean { return variant.saleState !== VariantSaleState.Unknown && variant.condition !== ProductCondition.Unknown && (!variant.outlet || variant.outlet.scope !== OutletScope.Unknown); }
  static known(product: DemoProduct): boolean { return this.knownProduct(product) && product.variants.every(variant => this.knownVariant(variant)); }
  static validate(product: DemoProduct, allowUnknown = false): void {
    if (!integer(product.price) || product.price <= 0 || !integer(product.original) || product.original < product.price || !integer(product.onHand) || !integer(product.reserved) || product.reserved > product.onHand) throw new CatalogValidationError('El resumen del producto contiene precios o stock inválidos.');
    if (!text(product.sku) || !text(product.name) || typeof product.description !== 'string' || !Array.isArray(product.attributes) || product.attributes.some(attribute => !text(attribute.name) || !text(attribute.value)) || !Array.isArray(product.variants) || !product.variants.length || !unique(product.variants) || !this.media(product.media)) throw new CatalogValidationError('Completá SKU, nombre, ficha técnica, variantes únicas e imágenes locales con texto alternativo.');
    if (!allowUnknown && product.publication === ProductPublication.Unknown) throw new CatalogValidationError('La publicación del producto es desconocida.');
    product.variants.forEach(variant => this.variant(variant, allowUnknown));
    if (!product.variants.some(variant => variant.saleState === VariantSaleState.Active || (allowUnknown && variant.saleState === VariantSaleState.Unknown))) throw new CatalogValidationError('Conservá al menos una variante habilitada. Puede tener disponibilidad cero.');
    const references = product.variants.filter(variant => variant.outlet).map(variant => ({ id: variant.outlet!.reference }));
    if (!unique(references)) throw new CatalogValidationError('Cada unidad o lote Outlet necesita una referencia única dentro del producto.');
  }
  static preserveReservations(existing: DemoProduct, proposed: DemoProduct): void {
    for (const current of existing.variants) {
      const next = proposed.variants.find(variant => variant.id === current.id);
      if (current.reserved > 0 && (!next || !next.saleState.active || !proposed.publication.published || next.onHand - next.notSellable < current.reserved || next.condition !== current.condition || next.outlet?.reference !== current.outlet?.reference)) throw new CatalogValidationError('No se puede eliminar, desactivar, cambiar la condición ni reducir la disponibilidad de una variante con reservas activas.');
    }
  }
  static clone(product: DemoProduct): DemoProduct {
    return { ...product, attributes: product.attributes.map(value => ({ ...value })), media: product.media.map(value => ({ ...value })), variants: product.variants.map(variant => ({ ...variant, attributes: variant.attributes.map(value => ({ ...value })), outlet: variant.outlet ? { ...variant.outlet, media: variant.outlet.media.map(value => ({ ...value })) } : null })) };
  }
}
