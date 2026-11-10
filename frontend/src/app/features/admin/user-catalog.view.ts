import { BoundedPaginationComponent } from '../../shared/bounded-pagination.component';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { ProductDetail, ProductVariant } from '../../domain/catalog/product-detail.entity';
import { AdminCatalogState } from './admin-catalog.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { ProductStatus, VariantStatus } from '../../domain/catalog/catalog-states';

@Component({
  selector: 'sc-user-catalog-view',
  imports: [BoundedPaginationComponent, FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-catalog.view.html',
})
export class UserCatalogViewComponent {
  readonly variantStatuses = VariantStatus.selectable;
  @Input({ required: true }) state!: AdminCatalogState;
  @Output() readonly draftChange = new EventEmitter<ProductDetail>();
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

  patch(partial: Partial<ProductDetail>): void {
    this.draftChange.emit({ ...this.state.draft, ...partial });
  }

  setActive(active: boolean): void { this.patch({ status: active ? ProductStatus.Active : ProductStatus.Draft, active }); }
  attributes(value: Readonly<Record<string, unknown>>): readonly { key: string; displayValue: string }[] {
    return Object.entries(value).map(([key, rawValue]) => ({
      key,
      displayValue: typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue) ?? '',
    }));
  }

  patchVariant(index: number, partial: Partial<ProductVariant>): void {
    const variants = this.state.draft.variants.map((variant, current) => current === index ? { ...variant, ...partial } : variant);
    this.patch({ variants });
  }

  setVariantStatus(index: number, raw: unknown): void {
    this.patchVariant(index, { status: VariantStatus.fromWire(raw) });
  }

  patchAttributeKey(variantIndex: number, attributeIndex: number, key: string): void {
    const variant = this.state.draft.variants[variantIndex];
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
    const variant = this.state.draft.variants[variantIndex];
    if (!variant) return;
    const entries = Object.entries(variant.attributes);
    const current = entries[attributeIndex];
    if (!current) return;
    entries[attributeIndex] = [current[0], value];
    this.patchVariant(variantIndex, { attributes: Object.fromEntries(entries) });
  }

  addAttribute(variantIndex: number): void {
    const variant = this.state.draft.variants[variantIndex];
    if (!variant) return;
    let suffix = 1;
    let key = 'Característica';
    while (Object.hasOwn(variant.attributes, key)) key = `Característica ${++suffix}`;
    this.patchVariant(variantIndex, { attributes: { ...variant.attributes, [key]: '' } });
  }

  removeAttribute(variantIndex: number, key: string): void {
    const variant = this.state.draft.variants[variantIndex];
    if (!variant) return;
    this.patchVariant(variantIndex, { attributes: Object.fromEntries(Object.entries(variant.attributes).filter(([name]) => name !== key)) });
  }

  patchPrice(partial: Partial<ProductDetail['price']>): void {
    const draft = this.state.draft;
    this.draftChange.emit({ ...draft, price: { ...draft.price, ...partial } });
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
