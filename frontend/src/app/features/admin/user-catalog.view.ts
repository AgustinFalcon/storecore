import { BoundedPaginationComponent } from '../../shared/bounded-pagination.component';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { CatalogProductDraft, CatalogVariantDraft, newCatalogVariant } from '../../domain/catalog/catalog-product-draft';
import { AdminCatalogState } from './admin-catalog.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { ProductStatus, VariantStatus } from '../../domain/catalog/catalog-states';
import { parseArsAmountInput, VariantPriceCommand } from '../../domain/catalog/variant-price';

@Component({
  selector: 'sc-user-catalog-view',
  imports: [BoundedPaginationComponent, FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-catalog.view.html',
})
export class UserCatalogViewComponent {
  private currentState!: AdminCatalogState;
  private currentDraft!: CatalogProductDraft;

  priceCommands(variant: CatalogVariantDraft): readonly VariantPriceCommand[] {
    return variant.id ? VariantPriceCommand.selectable : [VariantPriceCommand.Inherit, VariantPriceCommand.Override];
  }
  setPriceCommand(index: number, raw: unknown): void {
    this.patchVariant(index, { priceCommand: VariantPriceCommand.fromWire(raw) });
  }
  setProductBasePriceInput(raw: unknown): void {
    const value = typeof raw === 'string' ? raw : '';
    this.patch({ productBasePriceRaw: value, productBasePrice: parseArsAmountInput(value) });
  }
  setVariantPriceInput(index: number, raw: unknown): void {
    const value = typeof raw === 'string' ? raw : '';
    this.patchVariant(index, { priceInputRaw: value, priceInput: parseArsAmountInput(value) });
  }
  readonly productStatuses = ProductStatus.selectable;
  readonly unknownProductStatus = ProductStatus.Unknown;
  readonly variantStatuses = VariantStatus.selectable;
  @Input({ required: true })
  set state(value: AdminCatalogState) {
    this.currentState = value;
    this.currentDraft = value.draft;
  }
  get state(): AdminCatalogState { return this.currentState; }
  @Output() readonly draftChange = new EventEmitter<CatalogProductDraft>();
  @Output() readonly createProduct = new EventEmitter<void>();
  @Output() readonly editProduct = new EventEmitter<ProductDetail>();
  @Output() readonly brandDraftChange = new EventEmitter<CatalogFacet>();
  @Output() readonly categoryDraftChange = new EventEmitter<CatalogFacet>();
  @Output() readonly saveProduct = new EventEmitter<void>();
  @Output() readonly saveBrand = new EventEmitter<void>();
  @Output() readonly saveCategory = new EventEmitter<void>();
  @Output() readonly pageChange = new EventEmitter<number>();
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly editError = new EventEmitter<string>();

  get imagesText(): string {
    return this.state.draft.images.join('\n');
  }

  patch(partial: Partial<CatalogProductDraft>): void {
    this.currentDraft = { ...this.currentDraft, ...partial };
    this.draftChange.emit(this.currentDraft);
  }

  patchSku(sku: string): void {
    const previous = this.currentDraft.sku;
    const variants = this.currentDraft.variants.map((variant, index) => index === 0 && !variant.id && (!variant.sku || variant.sku === previous) ? { ...variant, sku } : variant);
    this.patch({ sku, variants });
  }

  setProductStatus(raw: unknown): void { this.patch({ status: ProductStatus.fromWire(raw) }); }
  attributes(value: Readonly<Record<string, unknown>>): readonly { key: string; displayValue: string }[] {
    return Object.entries(value).map(([key, rawValue]) => ({
      key,
      displayValue: typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue) ?? '',
    }));
  }

  patchVariant(index: number, partial: Partial<CatalogVariantDraft>): void {
    const variants = this.currentDraft.variants.map((variant, current) => current === index ? { ...variant, ...partial } : variant);
    this.patch({ variants });
  }

  addVariant(): void { this.patch({ variants: [...this.currentDraft.variants, newCatalogVariant()] }); }
  removeNewVariant(index: number): void {
    const variant = this.currentDraft.variants[index];
    if (!variant || variant.id || index === 0) return;
    this.patch({ variants: this.currentDraft.variants.filter((_, current) => current !== index) });
  }

  setVariantStatus(index: number, raw: unknown): void {
    this.patchVariant(index, { status: VariantStatus.fromWire(raw) });
  }

  patchAttributeKey(variantIndex: number, attributeIndex: number, key: string): void {
    const variant = this.currentDraft.variants[variantIndex];
    if (!variant) return;
    const entries = Object.entries(variant.attributes);
    const current = entries[attributeIndex];
    if (!current) return;
    if (key !== current[0] && Object.hasOwn(variant.attributes, key)) {
      this.editError.emit(`El atributo “${key}” ya existe en esta variante.`);
      return;
    }
    entries[attributeIndex] = [key, current[1]];
    this.patchVariant(variantIndex, { attributes: Object.fromEntries(entries) });
  }

  patchAttributeValue(variantIndex: number, attributeIndex: number, value: string): void {
    const variant = this.currentDraft.variants[variantIndex];
    if (!variant) return;
    const entries = Object.entries(variant.attributes);
    const current = entries[attributeIndex];
    if (!current) return;
    entries[attributeIndex] = [current[0], value];
    this.patchVariant(variantIndex, { attributes: Object.fromEntries(entries) });
  }

  addAttribute(variantIndex: number): void {
    const variant = this.currentDraft.variants[variantIndex];
    if (!variant) return;
    let suffix = 1;
    let key = 'Característica';
    while (Object.hasOwn(variant.attributes, key)) key = `Característica ${++suffix}`;
    this.patchVariant(variantIndex, { attributes: { ...variant.attributes, [key]: '' } });
  }

  removeAttribute(variantIndex: number, key: string): void {
    const variant = this.currentDraft.variants[variantIndex];
    if (!variant) return;
    this.patchVariant(variantIndex, { attributes: Object.fromEntries(Object.entries(variant.attributes).filter(([name]) => name !== key)) });
  }

  setImages(value: string): void {
    this.patch({
      images: value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    });
  }

}
