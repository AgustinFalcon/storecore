import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DemoProduct, DemoProductVariantRecord } from './catalog/catalog-model';
import { OutletScope, ProductCondition, VariantSaleState } from './catalog/catalog-types';
import { DemoProductDraftEditor, ProductDraftChange } from './catalog/product-draft-editor';

/** Detached proposal; the submitted event is the sole persistence intention. */
@Component({ selector: 'sc-demo-product-editor', imports: [FormsModule], templateUrl: './demo-product-editor.html', styleUrl: './demo.scss' })
export class DemoProductEditorComponent {
  @Input({ required: true }) product!: DemoProduct;
  @Input() editing = false;
  @Input() error = '';
  @ViewChild('errorSummary') private errorSummary?: ElementRef<HTMLElement>;
  @Output() readonly submitted = new EventEmitter<void>();
  @Output() readonly cancelled = new EventEmitter<void>();
  readonly Math = Math;
  readonly Sale = VariantSaleState;
  readonly Condition = ProductCondition;
  readonly Scope = OutletScope;
  readonly mediaOptions = Array.from({ length: 12 }, (_, index) => `/assets/demo/DEMO-${String(index + 1).padStart(3, '0')}.svg`);
  private readonly editor = new DemoProductDraftEditor(undefined, this.mediaOptions);
  issue = '';
  private replace(draft: DemoProduct): void { Object.assign(this.product, draft); this.issue = ''; }
  private change(change: ProductDraftChange): void { this.replace(change.draft); this.issue = change.issue.message; }
  submitDraft(): void { this.submitted.emit(); setTimeout(() => { if (this.error) { this.errorSummary?.nativeElement.focus(); this.errorSummary?.nativeElement.scrollIntoView({ block: 'nearest' }); } }); }
  addVariant(): void { this.replace(this.editor.addVariant(this.product)); }
  removeVariant(index: number): void { this.change(this.editor.removeVariant(this.product, index)); }
  addMedia(): void { this.replace(this.editor.addMedia(this.product)); }
  removeMedia(index: number): void { this.change(this.editor.removeMedia(this.product, index)); }
  moveMedia(index: number, direction: number): void { this.replace(this.editor.moveMedia(this.product, index, direction)); }
  addAttribute(): void { this.replace(this.editor.addAttribute(this.product)); }
  removeAttribute(index: number): void { this.replace(this.editor.removeAttribute(this.product, index)); }
  addVariantAttribute(variant: DemoProductVariantRecord): void { this.editor.addVariantAttribute(variant); }
  removeVariantAttribute(variant: DemoProductVariantRecord, index: number): void { this.editor.removeVariantAttribute(variant, index); }
  setSale(variant: DemoProductVariantRecord, raw: unknown): void { variant.saleState = VariantSaleState.fromWire(raw); }
  setCondition(variant: DemoProductVariantRecord, raw: unknown): void { this.editor.setCondition(this.product, variant, raw); }
  setScope(variant: DemoProductVariantRecord, raw: unknown): void { if (variant.outlet) variant.outlet.scope = OutletScope.fromWire(raw); }
  addOutletMedia(variant: DemoProductVariantRecord): void { this.editor.addOutletMedia(variant); }
  removeOutletMedia(variant: DemoProductVariantRecord, index: number): void { this.editor.removeOutletMedia(variant, index); }
}
