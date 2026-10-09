import { Component, ElementRef, EventEmitter, Input, Output, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoProduct, DemoSellableVariant, DemoMedia, DEMO_MEDIA } from './demo-model';

/** Owns a detached draft; submitting is the only persistence intention. */
@Component({ selector: 'sc-demo-product-editor', imports: [FormsModule], templateUrl: './demo-product-editor.html', styleUrl: './demo.scss' })
export class DemoProductEditorComponent implements OnInit {
  @Input({ required: true }) product!: DemoProduct;
  @Input() editing = false;
  @Input() error = '';
  @ViewChild('errorSummary') private errorSummary?: ElementRef<HTMLElement>;
  @Output() readonly submitted = new EventEmitter<void>();
  @Output() readonly cancelled = new EventEmitter<void>();
  readonly Math = Math;
  readonly mediaOptions = DEMO_MEDIA;
  private readonly existingIds = new Set<string>();
  ngOnInit(): void { if (this.editing) for (const variant of this.product.variants ?? []) this.existingIds.add(variant.id); }
  submitDraft(): void {
    this.submitted.emit();
    setTimeout(() => { if (this.error) { this.errorSummary?.nativeElement.focus(); this.errorSummary?.nativeElement.scrollIntoView({ block: 'nearest' }); } });
  }
  isPersisted(variant: DemoSellableVariant): boolean { return this.existingIds.has(variant.id); }
  money(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value/100); }
  addDraftVariant(): void { this.product.variants!.push({ id: crypto.randomUUID(), name: '', price: 10000, onHand: 0, reserved: 0, active: true, attributes: [], images: [] }); }
  addDraftAttribute(variant: DemoSellableVariant): void { variant.attributes.push({ name: '', value: '' }); }
  removeDraftVariant(variant: DemoSellableVariant): void { if (this.isPersisted(variant)) variant.active=false; else if (this.product.variants!.length>1) this.product.variants=this.product.variants!.filter(value=>value.id!==variant.id); }
  addDraftImage(images: DemoMedia[]): void { images.push({ id: crypto.randomUUID(), src: DEMO_MEDIA[0], alt: '' }); }
}
