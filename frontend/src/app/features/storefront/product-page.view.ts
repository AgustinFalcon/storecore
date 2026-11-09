import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Cart } from '../../domain/cart/cart.entity';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

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
  quantity = 1;
  activeImage = '';
  selectedVariantId = '';

  @Output() readonly add = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly selectCustomer = new EventEmitter<void>();
  @Output() readonly toggleFavorite = new EventEmitter<string>();

  ngOnChanges(changes: SimpleChanges): void {
    const product = changes['product'];
    if (product && product.previousValue?.sku !== product.currentValue?.sku) {
      this.activeImage = '';
      this.quantity = 1;
      this.selectedVariantId = '';
    }
  }

  get hasDiscount(): boolean {
    return !!this.product?.price.offer && this.product.price.original !== null && this.product.price.original > this.product.price.effective;
  }

  get selectedVariant() {
    return this.product?.variants.find(variant => variant.id === this.selectedVariantId) ??
      this.product?.variants.find(variant => variant.sku === this.product?.sku) ?? this.product?.variants[0] ?? null;
  }
  get canPurchase(): boolean {
    const variant = this.selectedVariant;
    return !!this.product?.status.isPublic && !!variant?.status.isPublic && variant.availability.canSell &&
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
  }

  submit(sku: string): void {
    if (!this.access.canMutate || !this.canPurchase) return;
    this.add.emit({ sku: this.selectedVariant?.sku ?? sku, quantity: this.quantity });
  }
}
