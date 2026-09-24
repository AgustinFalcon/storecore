import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { ProductDetail, ProductVariant } from '../../domain/catalog/product-detail.entity';
import { AdminCatalogState } from './admin-catalog.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-user-catalog-view',
  imports: [FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-catalog.view.html',
})
export class UserCatalogViewComponent {
  @Input({ required: true }) state!: AdminCatalogState;
  @Output() readonly draftChange = new EventEmitter<ProductDetail>();
  @Output() readonly brandDraftChange = new EventEmitter<CatalogFacet>();
  @Output() readonly categoryDraftChange = new EventEmitter<CatalogFacet>();
  @Output() readonly saveProduct = new EventEmitter<void>();
  @Output() readonly saveBrand = new EventEmitter<void>();
  @Output() readonly saveCategory = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();

  get imagesText(): string {
    return this.state.draft.images.join('\n');
  }

  get variantsText(): string {
    return this.state.draft.variants
      .map((variant) => `${variant.id}|${variant.sku}|${variant.name}|${variant.availableQuantity}`)
      .join('\n');
  }

  patch(partial: Partial<ProductDetail>): void {
    this.draftChange.emit({ ...this.state.draft, ...partial });
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

  setVariants(value: string): void {
    const variants: ProductVariant[] = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [id, sku, name, qty] = line.split('|');
        return { id: id ?? '', sku: sku ?? '', name: name ?? '', availableQuantity: Number(qty) || 0 };
      });
    this.patch({ variants });
  }
}
