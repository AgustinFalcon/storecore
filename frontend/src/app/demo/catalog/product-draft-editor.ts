import type { DemoProduct, DemoProductVariantRecord } from './catalog-model';
import { OutletScope, ProductCondition, ProductPublication, VariantSaleState } from './catalog-types';

export class ProductDraftIssue {
  private constructor(readonly wire: string, readonly message: string) {}

  static readonly None = new ProductDraftIssue('NONE', '');
  static readonly NeedsMedia = new ProductDraftIssue('NEEDS_MEDIA', 'El producto necesita al menos una imagen de demostración.');
  static readonly NeedsVariant = new ProductDraftIssue('NEEDS_VARIANT', 'El producto necesita al menos una variante vendible.');
  static readonly ReservedVariant = new ProductDraftIssue('RESERVED_VARIANT', 'No se puede quitar una variante con reservas.');
  static readonly Unknown = new ProductDraftIssue('', 'No se pudo aplicar el cambio al borrador.');

  static readonly all = [this.None, this.NeedsMedia, this.NeedsVariant, this.ReservedVariant] as const;

  static fromWire(raw: unknown): ProductDraftIssue {
    return this.all.find(issue => issue.wire === raw) ?? this.Unknown;
  }
}

export interface ProductDraftChange {
  readonly draft: DemoProduct;
  readonly issue: ProductDraftIssue;
}

export class DemoProductDraftEditor {
  constructor(
    private readonly createId: () => string = () => crypto.randomUUID(),
    readonly mediaOptions: readonly string[] = Array.from(
      { length: 12 },
      (_, index) => `/assets/demo/DEMO-${String(index + 1).padStart(3, '0')}.jpg`,
    ),
  ) {}

  create(sku = ''): DemoProduct {
    return {
      sku,
      name: '',
      category: 'Herramientas',
      brand: 'Norte',
      description: '',
      price: 10000,
      original: 10000,
      onHand: 1,
      reserved: 0,
      publication: ProductPublication.Published,
      tone: '#e6a63f',
      variant: 'Estándar',
      attributes: [{ name: 'Garantía', value: 'No informada' }],
      media: [{ id: 'new-front', src: '/assets/demo/DEMO-010.jpg', alt: 'Vista frontal de demostración pendiente de reemplazo' }],
      variants: [{
        id: 'new-standard',
        label: 'Estándar',
        attributes: [{ name: 'Presentación', value: 'Estándar' }],
        price: 10000,
        original: 10000,
        onHand: 1,
        reserved: 0,
        notSellable: 0,
        saleState: VariantSaleState.Active,
        condition: ProductCondition.Standard,
        outlet: null,
      }],
    };
  }

  addAttribute(draft: DemoProduct): DemoProduct {
    return { ...draft, attributes: [...draft.attributes, { name: 'Característica', value: '' }] };
  }

  removeAttribute(draft: DemoProduct, index: number): DemoProduct {
    return { ...draft, attributes: draft.attributes.filter((_, current) => current !== index) };
  }

  addMedia(draft: DemoProduct): DemoProduct {
    const index = draft.media.length;
    return {
      ...draft,
      media: [...draft.media, {
        id: this.createId(),
        src: this.mediaOptions[index % this.mediaOptions.length],
        alt: `Imagen ${index + 1} de ${draft.name || 'producto demo'}`,
      }],
    };
  }

  removeMedia(draft: DemoProduct, index: number): ProductDraftChange {
    if (draft.media.length <= 1) return { draft, issue: ProductDraftIssue.NeedsMedia };
    return { draft: { ...draft, media: draft.media.filter((_, current) => current !== index) }, issue: ProductDraftIssue.None };
  }

  moveMedia(draft: DemoProduct, index: number, delta: number): DemoProduct {
    const target = index + delta;
    if (target < 0 || target >= draft.media.length) return draft;
    const media = [...draft.media];
    [media[index], media[target]] = [media[target], media[index]];
    return { ...draft, media };
  }

  addVariant(draft: DemoProduct): DemoProduct {
    const index = draft.variants.length + 1;
    const sku = draft.sku || 'new';
    return {
      ...draft,
      variants: [...draft.variants, {
        id: `${sku}-variant-${this.createId().slice(0, 8)}`,
        label: `Variante ${index}`,
        attributes: [{ name: 'Presentación', value: `Variante ${index}` }],
        price: draft.variants[0]?.price ?? 10000,
        original: draft.variants[0]?.original ?? 10000,
        onHand: 0,
        reserved: 0,
        notSellable: 0,
        saleState: VariantSaleState.Active,
        condition: ProductCondition.Standard,
        outlet: null,
      }],
    };
  }

  removeVariant(draft: DemoProduct, index: number): ProductDraftChange {
    if (draft.variants.length <= 1) return { draft, issue: ProductDraftIssue.NeedsVariant };
    const variant = draft.variants[index];
    if (!variant) return { draft, issue: ProductDraftIssue.Unknown };
    if (variant.reserved > 0) return { draft, issue: ProductDraftIssue.ReservedVariant };
    return { draft: { ...draft, variants: draft.variants.filter((_, current) => current !== index) }, issue: ProductDraftIssue.None };
  }

  setCondition(draft: DemoProduct, variant: DemoProductVariantRecord, raw: unknown): void {
    variant.condition = ProductCondition.fromWire(raw);
    variant.outlet = variant.condition === ProductCondition.Outlet
      ? {
          scope: OutletScope.Unit,
          reference: variant.id,
          notes: '',
          defects: '',
          warrantyTerms: '',
          media: draft.media.map(media => ({ ...media })),
        }
      : null;
  }

  addVariantAttribute(variant: DemoProductVariantRecord): void {
    variant.attributes = [...variant.attributes, { name: '', value: '' }];
  }

  removeVariantAttribute(variant: DemoProductVariantRecord, index: number): void {
    variant.attributes = variant.attributes.filter((_, current) => current !== index);
  }

  addOutletMedia(variant: DemoProductVariantRecord): void {
    if (!variant.outlet) return;
    variant.outlet.media.push({ id: this.createId(), src: this.mediaOptions[0], alt: '' });
  }

  removeOutletMedia(variant: DemoProductVariantRecord, index: number): void {
    if (variant.outlet && variant.outlet.media.length > 1) variant.outlet.media.splice(index, 1);
  }
}
