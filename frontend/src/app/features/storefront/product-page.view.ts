import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Cart } from '../../domain/cart/cart.entity';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { OptionSelection, OptionSelectionEngine } from '../../domain/catalog/option-selection-engine';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

export interface ProductPurchaseSelection {
  readonly variantId: string;
  readonly variantSku: string;
  readonly optionValues: ReadonlyMap<string, string>;
  readonly quantity: number;
  readonly revision: number;
}
export interface ProductSelectionChangeRequest { readonly apply: () => void; }

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
  @Input() selectionBlocked = false;
  @Input() currentCartQuantity = 0;
  quantity = 1;
  activeImage = '';
  selectedVariantId = '';
  private optionEngine: OptionSelectionEngine | null = null;
  private optionSelection: OptionSelection | null = null;

  @Output() readonly add = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly selectCustomer = new EventEmitter<void>();
  @Output() readonly toggleFavorite = new EventEmitter<string>();
  @Output() readonly requestAccess = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly reviseIntent = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly requestSelectionChange = new EventEmitter<ProductSelectionChangeRequest>();
  @Output() readonly cancelIntent = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    const product = changes['product'];
    if (product) {
      const routeChanged = product.previousValue?.sku !== product.currentValue?.sku;
      const selectedSku = routeChanged ? null : this.optionSelection?.variant?.sku ?? null;
      if (routeChanged) { this.activeImage = ''; this.quantity = 1; }
      const exactRouteSku = this.product?.variants.some(variant => variant.sku === this.product?.sku) ? this.product?.sku ?? null : null;
      this.rebuildSelection(selectedSku ?? exactRouteSku, this.quantity);
    }
    const restored = changes['restoredSelection'];
    const selectionChanged = restored && this.restoredSelection && (!restored.previousValue
      || restored.previousValue.revision !== this.restoredSelection.revision
      || restored.previousValue.variantSku !== this.restoredSelection.variantSku
      || restored.previousValue.quantity !== this.restoredSelection.quantity);
    if (selectionChanged && this.restoredSelection) {
      this.quantity = this.restoredSelection.quantity;
      this.rebuildSelection(this.restoredSelection.variantSku, this.quantity);
    }
  }

  get hasDiscount(): boolean {
    return !!this.selectedPrice?.offer && this.selectedPrice.original > this.selectedPrice.effective;
  }
  get selectedPrice() { return this.selectedVariant?.pricePolicy?.known ? this.selectedVariant.price?.price ?? null : null; }

  get selectedVariant() {
    const variantId = this.optionSelection?.variant?.variantId;
    return variantId ? this.product?.variants.find(variant => variant.id === variantId) ?? null : null;
  }
  get canPurchase(): boolean {
    const variant = this.selectedVariant;
    const selection = this.optionEngine && this.optionSelection ? this.optionEngine.withQuantity(this.optionSelection, this.quantity) : null;
    return !this.selectionBlocked && !!selection?.canPurchase && !!this.product?.status.isPublic && !!variant?.status.isPublic;
  }
  get canIncrease(): boolean {
    return !!this.selectedVariant?.availability.canSell && this.quantity < (this.selectedVariant.inventory.saleable ?? 0);
  }
  attributes(value: Readonly<Record<string, unknown>>): readonly [string, string][] {
    return Object.entries(value).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]);
  }

  changeQty(delta: number): void {
    this.quantity = Math.max(1, Number(this.quantity) + delta);
    if (this.optionEngine && this.optionSelection) this.optionSelection = this.optionEngine.withQuantity(this.optionSelection, this.quantity);
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
    if (this.intentBusy) return;
    if (id === this.selectedVariantId) return;
    let approved = !this.requestSelectionChange.observed;
    this.requestSelectionChange.emit({ apply: () => { approved = true; } });
    if (!approved) return;
    this.selectedVariantId = id;
    const sku = this.product?.variants.find(variant => variant.id === id)?.sku ?? null;
    this.rebuildSelection(sku, this.quantity);
  }

  setQuantity(value: unknown): void {
    this.quantity = Number(value);
    if (this.optionEngine && this.optionSelection) this.optionSelection = this.optionEngine.withQuantity(this.optionSelection, this.quantity);
  }

  commitQuantityRevision(): void { this.reportRevision(); }

  private reportRevision(): void {
    const variant = this.selectedVariant;
    if (this.restoredSelection && variant) this.reviseIntent.emit({ sku: variant.sku, quantity: this.quantity });
  }

  private rebuildSelection(sku: string | null, quantity: number): void {
    const product = this.product;
    if (!product?.optionSnapshot) { this.optionEngine = null; this.optionSelection = null; this.selectedVariantId = ''; return; }
    this.optionEngine = new OptionSelectionEngine(product.optionSnapshot, product.variants.map(variant => ({
      variantId: variant.id, priceKnown: variant.price.known && variant.pricePolicy.known,
      availableQuantity: variant.inventory.saleable,
    })));
    this.optionSelection = this.optionEngine.start(sku, quantity);
    this.selectedVariantId = this.optionSelection.variant?.variantId ?? '';
  }
}
