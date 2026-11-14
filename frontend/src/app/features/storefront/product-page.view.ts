import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Cart } from '../../domain/cart/cart.entity';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

export interface ProductPurchaseSelection {
  readonly variantSku: string;
  readonly quantity: number;
  readonly revision: number;
}

@Component({
  selector: 'sc-product-page-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-page.view.html',
})
export class ProductPageViewComponent implements OnChanges {
  @Input() product: ProductDetail | null = null;
  @Input() cart: Cart | null = null;
  @Input() loading = false;
  @Input() error = '';
  @Input() access = CustomerCartAccess.Unknown;
  @Input() favorite = false;
  @Input() favoriteBusy = false;
  @Input() favoriteFeedback = '';
  @Input() restoredSelection: ProductPurchaseSelection | null = null;
  @Input() intentMessage = '';
  @Input() intentCanConfirm = false;
  @Input() intentBusy = false;
  @Input() currentCartQuantity = 0;
  quantity = 1;
  activeImage = '';
  selectedVariantId = '';

  @Output() readonly add = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly selectCustomer = new EventEmitter<void>();
  @Output() readonly toggleFavorite = new EventEmitter<string>();
  @Output() readonly requestAccess = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly reviseIntent = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly cancelIntent = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    const product = changes['product'];
    if (product && product.previousValue?.sku !== product.currentValue?.sku) {
      this.activeImage = '';
      this.quantity = 1;
      this.selectedVariantId = this.defaultVariantId();
    }
    const restored = changes['restoredSelection'];
    const selectionChanged = restored && this.restoredSelection && (!restored.previousValue
      || restored.previousValue.revision !== this.restoredSelection.revision
      || restored.previousValue.variantSku !== this.restoredSelection.variantSku
      || restored.previousValue.quantity !== this.restoredSelection.quantity);
    if (selectionChanged && this.restoredSelection) {
      const exact = this.product?.variants.find((variant) => variant.sku === this.restoredSelection?.variantSku);
      this.selectedVariantId = exact?.id ?? '';
      this.quantity = this.restoredSelection.quantity;
    }
  }

  get hasDiscount(): boolean {
    return !!this.selectedPrice?.offer && this.selectedPrice.original > this.selectedPrice.effective;
  }
  get selectedPrice() { return this.selectedVariant?.pricePolicy?.known ? this.selectedVariant.price?.price ?? null : null; }

  get selectedVariant() {
    return this.product?.variants.find(variant => variant.id === this.selectedVariantId) ?? null;
  }
  get canPurchase(): boolean {
    const variant = this.selectedVariant;
    return !!this.product?.status.isPublic && !!variant?.status.isPublic && !!variant.price?.known && !!variant.pricePolicy?.known && variant.availability.canSell &&
      Number.isSafeInteger(this.quantity) && this.quantity > 0 && variant.inventory.saleable !== null && this.quantity <= variant.inventory.saleable;
  }
  get canIncrease(): boolean {
    return !!this.selectedVariant?.availability.canSell && this.quantity < (this.selectedVariant.inventory.saleable ?? 0);
  }
  attributes(value: Readonly<Record<string, unknown>>): readonly [string, string][] {
    return Object.entries(value).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]);
  }

  changeQty(delta: number): void {
    this.quantity = Math.max(1, Number(this.quantity) + delta);
    this.reportRevision();
  }

  submit(sku: string): void {
    if (!this.canPurchase) return;
    const selectedSku = this.selectedVariant?.sku ?? sku;
    if (!this.access.canMutate) {
      this.requestAccess.emit({ sku: selectedSku, quantity: this.quantity });
      return;
    }
    this.add.emit({ sku: selectedSku, quantity: this.quantity });
  }

  selectVariant(id: string): void {
    this.selectedVariantId = id;
    this.quantity = 1;
    this.reportRevision();
  }

  setQuantity(value: unknown): void {
    this.quantity = Number(value);
  }

  commitQuantityRevision(): void { this.reportRevision(); }

  private reportRevision(): void {
    const variant = this.selectedVariant;
    if (this.restoredSelection && variant) this.reviseIntent.emit({ sku: variant.sku, quantity: this.quantity });
  }

  private defaultVariantId(): string {
    return this.product?.variants.find((variant) => variant.sku === this.product?.sku)?.id
      ?? this.product?.variants[0]?.id ?? '';
  }
}
