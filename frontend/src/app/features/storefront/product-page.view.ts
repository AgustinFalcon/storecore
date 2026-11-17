import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Cart } from '../../domain/cart/cart.entity';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { OptionSelection, OptionSelectionEngine } from '../../domain/catalog/option-selection-engine';
import { OptionSchemaState, OptionSelectionState } from '../../domain/catalog/option-schema';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { GenericVariantChoice, GenericVariantSelectorComponent } from './generic-variant-selector.component';
import { OptionAxisView, ProductOptionSelectorComponent } from './product-option-selector.component';

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
  imports: [FormsModule, RouterLink, FeatureStatusComponent, ProductOptionSelectorComponent, GenericVariantSelectorComponent],
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
  private publicationGeneration = 0;

  @Output() readonly add = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly selectCustomer = new EventEmitter<void>();
  @Output() readonly toggleFavorite = new EventEmitter<string>();
  @Output() readonly requestAccess = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly reviseIntent = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly requestSelectionChange = new EventEmitter<ProductSelectionChangeRequest>();
  @Output() readonly selectedSkuChange = new EventEmitter<string>();
  @Output() readonly cancelIntent = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    const product = changes['product'];
    if (product) {
      const routeChanged = product.previousValue?.sku !== product.currentValue?.sku;
      const selectedSku = routeChanged ? null : this.optionSelection?.variant?.sku ?? null;
      const selectedValues = routeChanged ? null : this.optionSelection?.values ?? null;
      if (routeChanged) { this.activeImage = ''; this.quantity = 1; }
      const exactRouteSku = this.product?.variants.some(variant => variant.sku === this.product?.sku) ? this.product?.sku ?? null : null;
      this.rebuildSelection(selectedSku ?? exactRouteSku, this.quantity, selectedValues);
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
    if (this.loading || this.error) return null;
    const variantId = this.optionSelection?.variant?.variantId;
    return variantId ? this.product?.variants.find(variant => variant.id === variantId) ?? null : null;
  }
  get selectedSku(): string { return this.selectedVariant?.sku ?? ''; }
  get schemaState() { return this.product?.optionSnapshot.schema.state ?? OptionSchemaState.Unknown; }
  get hasValidSchema(): boolean { return this.schemaState === OptionSchemaState.Valid; }
  get hasAbsentSchema(): boolean { return this.schemaState === OptionSchemaState.Absent; }
  get hasUnknownSchema(): boolean { return !this.hasValidSchema && !this.hasAbsentSchema; }
  get selectionState() { return this.optionSelection?.state ?? OptionSelectionState.Unknown; }
  readonly selectionIncompleteState = OptionSelectionState.Incomplete;
  get selectionCause() { return this.optionSelection?.cause ?? this.product?.optionSnapshot.schema.cause ?? null; }
  get optionAxes(): readonly OptionAxisView[] {
    if (!this.optionEngine || !this.optionSelection || this.schemaState !== OptionSchemaState.Valid) return [];
    return this.product!.optionSnapshot.schema.axes.map(axis => ({ code: axis.code.value, label: axis.label.value, order: axis.order,
      presentation: axis.presentation, selectedValue: this.optionSelection!.values.get(axis.code.value) ?? null,
      choices: axis.values.map(value => { const choice = this.optionEngine!.valueChoice(this.optionSelection!, axis.code.value, value.code.value);
        return { code: value.code.value, label: value.label.value, availability: choice.availability, cause: choice.cause,
          swatchColor: value.swatchColor?.value ?? null }; }) }));
  }
  get genericChoices(): readonly GenericVariantChoice[] {
    if (!this.optionEngine || this.schemaState !== OptionSchemaState.Absent) return [];
    return this.product!.variants.map(variant => { const selection = this.optionEngine!.selectGeneric(variant.sku, 1);
      return { id: variant.id, sku: variant.sku, label: variant.name, enabled: selection.canPurchase,
        reason: selection.cause?.label ?? variant.availability.label }; });
  }
  get canPurchase(): boolean {
    const variant = this.selectedVariant;
    const selection = this.optionEngine && this.optionSelection ? this.optionEngine.withQuantity(this.optionSelection, this.quantity) : null;
    return !this.loading && !this.error && !this.selectionBlocked && !!selection?.canPurchase && !!this.product?.status.isPublic && !!variant?.status.isPublic;
  }
  get canIncrease(): boolean {
    return !!this.selectedVariant?.availability.canSell && this.quantity < (this.selectedVariant.inventory.saleable ?? 0);
  }
  get quantityMessage(): string {
    const saleable = this.selectedVariant?.inventory.saleable;
    return saleable !== null && saleable !== undefined && Number.isSafeInteger(this.quantity) && this.quantity > saleable
      ? `La cantidad elegida supera el stock disponible (${saleable}).` : '';
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
    if (this.schemaState !== OptionSchemaState.Absent) return;
    if (id === this.selectedVariantId) return;
    this.authorizeChange(() => {
      this.selectedVariantId = id;
      const sku = this.product?.variants.find(variant => variant.id === id)?.sku ?? null;
      this.rebuildSelection(sku, this.quantity);
    });
  }

  chooseOption(choice: { axisCode: string; valueCode: string }): void {
    if (this.intentBusy || !this.optionEngine || !this.optionSelection || this.schemaState !== OptionSchemaState.Valid) return;
    const availability = this.optionEngine.valueChoice(this.optionSelection, choice.axisCode, choice.valueCode).availability;
    if (!availability.enabled) return;
    this.authorizeChange(() => {
      this.optionSelection = this.optionEngine!.choose(this.optionSelection!, choice.axisCode, choice.valueCode);
      this.selectedVariantId = this.optionSelection.variant?.variantId ?? '';
      this.publishSelection();
    });
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

  private rebuildSelection(sku: string | null, quantity: number, values: ReadonlyMap<string, string> | null = null): void {
    const product = this.product;
    if (!product?.optionSnapshot) { this.optionEngine = null; this.optionSelection = null; this.selectedVariantId = ''; return; }
    this.optionEngine = new OptionSelectionEngine(product.optionSnapshot, product.variants.map(variant => ({
      variantId: variant.id, priceKnown: variant.price.known && variant.pricePolicy.known,
      availableQuantity: variant.inventory.saleable,
    })));
    this.optionSelection = values && product.optionSnapshot.schema.state === OptionSchemaState.Valid
      ? this.optionEngine.resolve(values, quantity) : this.optionEngine.start(sku, quantity);
    this.selectedVariantId = this.optionSelection.variant?.variantId ?? '';
    this.publishSelection();
  }

  private authorizeChange(apply: () => void): void {
    let approved = !this.requestSelectionChange.observed;
    this.requestSelectionChange.emit({ apply: () => { approved = true; } });
    if (approved) apply();
  }

  private publishSelection(): void {
    const generation = ++this.publicationGeneration;
    const sku = this.optionSelection?.variant?.sku ?? '';
    queueMicrotask(() => { if (generation === this.publicationGeneration) this.selectedSkuChange.emit(sku); });
  }
}
