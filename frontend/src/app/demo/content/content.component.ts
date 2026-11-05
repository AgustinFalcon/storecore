import { Component, DestroyRef, ElementRef, HostListener, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoApplicationState } from '../demo-state';
import { DemoProduct } from '../demo-model';
import { demoProductImage } from '../catalog/demo-product-image';
import { demoMoney } from '../demo-money';
import { trapDemoDialogFocus } from '../demo-dialog-focus';
import { ContentDraft, ContentDraftIssue } from './content-draft';
import { ContentFlow } from './content-flow';
import { ContentDialog, ContentDraftStatus, ContentEditPhase, ContentDiscardIntent } from './content-types';
import { CatalogBuyerPresenter } from '../rich-catalog/catalog-buyer-presenter';

@Component({ selector: 'sc-demo-content', imports: [FormsModule, RouterLink], templateUrl: './content.component.html', styleUrls: ['../demo.scss', './content.component.scss'] })
export class DemoContentComponent {
  readonly state = inject(DemoApplicationState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly revision = signal(0);
  readonly Phase = ContentEditPhase;
  readonly Dialog = ContentDialog;
  readonly Issue = ContentDraftIssue;
  readonly trapFocus = trapDemoDialogFocus;
  readonly activeProduct = (product: DemoProduct): boolean => product.active;
  readonly productImage = (product:DemoProduct):string=>this.productFacts(product).asset?.src??demoProductImage(product);
  productFacts(product:DemoProduct){return new CatalogBuyerPresenter().execute(this.state.data,product,variant=>this.state.commerce.price(product.sku,variant));}
  readonly reorderAnnouncement = signal('');
  readonly modal = viewChild<ElementRef<HTMLDialogElement>>('modal');
  readonly dialog = signal(ContentDialog.None);
  previewDraft = ContentDraft.empty();
  private alive = true;
  private trigger: HTMLElement | null = null;
  private epoch = this.state.sessionEpoch();
  private decision: { promise: Promise<boolean>; resolve(value: boolean): void } | null = null;
  readonly flow = new ContentFlow({
    authorized: () => this.state.canEditContent,
    epoch: () => this.state.sessionEpoch(),
    read: () => this.state.data.contentDraft,
    save: (draft, epoch) => Promise.resolve().then(() => this.alive && epoch === this.state.sessionEpoch() && this.state.saveContentDraft(draft, epoch)),
    error: () => this.state.error(),
  }, () => this.revision.update(value => value + 1));

  get authorized(): boolean { return this.state.canEditContent; }
  get current(): ContentFlow { this.revision(); return this.flow; }
  get status(): ContentDraftStatus { return ContentDraftStatus.of(this.current.dirty); }
  get discardIntent(): ContentDiscardIntent { return ContentDiscardIntent.of(this.decision !== null); }
  get categories(): string[] { return [...new Set(this.state.data.products.filter(this.activeProduct).map(product => product.category))]; }
  invalid(value: string): boolean { return this.current.phase === ContentEditPhase.Invalid && !value.trim(); }
  readonly money = demoMoney;
  reorder(index: number, delta: number): void {
    if (!this.flow.canEdit) return;
    const block = this.flow.draft.blocks[index]; if (!block) return;
    const epoch = this.state.sessionEpoch(); this.flow.reorder(index, delta);
    const position = this.flow.draft.blocks.findIndex(value => value.id === block.id);
    this.reorderAnnouncement.set(block.title+', bloque '+(position+1)+' de '+this.flow.draft.blocks.length+'.');
    setTimeout(() => {
      if (!this.alive || epoch !== this.state.sessionEpoch()) return;
      Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-block-editor-id]')).find(element => element.dataset['blockEditorId'] === block.id)?.querySelector<HTMLInputElement>('input')?.focus();
    }, 0);
  }

  constructor() {
    effect(() => { this.state.sessionEpoch(); this.state.context(); this.state.role(); untracked(() => this.invalidate()); });
    inject(DestroyRef).onDestroy(() => { this.alive = false; this.resolve(false); this.modal()?.nativeElement.close(); this.flow.dispose(); });
  }
  private invalidate(): void { this.epoch = this.state.sessionEpoch(); this.resolve(false); this.closeModal(false); this.flow.refresh(); this.previewDraft = ContentDraft.empty(); this.reorderAnnouncement.set(''); }
  async save(): Promise<void> {
    await this.flow.save();
    if (!this.alive || this.flow.phase !== ContentEditPhase.Invalid) return;
    const index = this.flow.draft.blocks.findIndex(block => !block.title.trim() || !block.body.trim());
    const id = this.flow.issue === ContentDraftIssue.Title ? 'content-title' : index >= 0 ? !this.flow.draft.blocks[index].title.trim() ? 'content-block-title-'+index : 'content-block-body-'+index : 'content-title';
    this.host.nativeElement.querySelector<HTMLElement>('#'+id)?.focus();
  }
  openPreview(): void { if (!this.flow.canEdit) return; this.previewDraft = this.flow.preview(); this.open(ContentDialog.Preview); }
  requestDiscard(): void { if (!this.flow.canEdit || !this.flow.dirty) return; this.open(ContentDialog.Discard); }
  private open(dialog: ContentDialog): void {
    if (this.dialog() !== ContentDialog.None) return;
    this.trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.dialog.set(dialog); this.modal()?.nativeElement.showModal();
    setTimeout(() => { if (this.alive && this.dialog() === dialog) this.modal()?.nativeElement.querySelector<HTMLElement>('[autofocus]')?.focus(); }, 0);
  }
  close(): void { this.closeModal(true); this.resolve(false); }
  private closeModal(restore: boolean): void {
    this.modal()?.nativeElement.close(); this.dialog.set(ContentDialog.None);
    if (restore && this.trigger?.isConnected) this.trigger.focus();
    if (restore && (!this.trigger?.isConnected || document.activeElement === document.body)) this.host.nativeElement.querySelector<HTMLElement>('#content-heading')?.focus();
  }
  confirmDiscard(): void {
    if (this.epoch !== this.state.sessionEpoch() || !this.authorized) { this.invalidate(); return; }
    this.flow.discard(); this.closeModal(true); this.resolve(true);
  }
  canLeave(): boolean | Promise<boolean> {
    if (!this.authorized || this.epoch !== this.state.sessionEpoch()) { this.invalidate(); return true; }
    if (this.flow.phase === ContentEditPhase.Saving) return false;
    if (!this.flow.dirty) return true;
    if (this.decision) return this.decision.promise;
    let resolveDecision!: (leave: boolean) => void;
    const promise = new Promise<boolean>(resolve => resolveDecision = resolve);
    this.decision = { promise, resolve: resolveDecision };
    if (this.dialog() !== ContentDialog.None) this.closeModal(false);
    this.open(ContentDialog.Discard);
    return promise;
  }
  private resolve(leave: boolean): void { const decision = this.decision; this.decision = null; decision?.resolve(leave); }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void { if (this.authorized && (this.flow.dirty || this.flow.phase === ContentEditPhase.Saving)) { event.preventDefault(); event.returnValue = ''; } }
}
