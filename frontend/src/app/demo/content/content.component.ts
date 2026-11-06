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
import { AddContentItemStep, ContentBannerTheme, ContentBannerDestination, MerchandisingItemKind, MoveContentItemStep, RemoveContentItemStep, SelectContentCategoryStep } from './content-merchandising';

@Component({ selector: 'sc-demo-content', imports: [FormsModule, RouterLink], templateUrl: './content.component.html', styleUrls: ['../demo.scss', './content.component.scss'] })
export class DemoContentComponent {
  readonly state = inject(DemoApplicationState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly revision = signal(0);
  readonly Phase = ContentEditPhase;
  readonly Dialog = ContentDialog;
  readonly Issue = ContentDraftIssue;
  readonly bannerThemes = ContentBannerTheme.all;
  readonly bannerDestinations = ContentBannerDestination.all;
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
  get selectedCategories(): string[] { return this.current.draft.categories ?? this.categories; }
  get previewCategories(): string[] { return (this.previewDraft.categories ?? this.categories).filter(category => this.categories.includes(category)); }
  categoryActive(category: string): boolean { return this.categories.includes(category); }
  addBanner(): void {
    if (!this.flow.canEdit || (this.flow.draft.banners?.length ?? 0) >= 3) return;
    this.flow.draft.banners = new AddContentItemStep().execute(this.flow.draft.banners ?? [], { id: crypto.randomUUID(), title: 'Prepará tu próximo proyecto', body: 'Descubrí productos para trabajar con confianza.', theme: ContentBannerTheme.Workshop, destination: ContentBannerDestination.Catalog }, 3); this.flow.edit();
  }
  removeBanner(index: number): void {
    if (!this.flow.canEdit) return; const banners = this.flow.draft.banners ?? [], fallback = banners[index + 1] ?? banners[index - 1];
    this.flow.draft.banners = new RemoveContentItemStep().execute(banners, index); this.flow.edit(); this.reorderAnnouncement.set('Banner eliminado.');
    this.restoreRemovalFocus(MerchandisingItemKind.Banner, fallback?.id);
  }
  changeBannerTheme(index: number, raw: unknown): void { const banner = this.flow.draft.banners?.[index]; if (!this.flow.canEdit || !banner) return; banner.theme = ContentBannerTheme.fromWire(raw); this.flow.edit(); }
  changeBannerDestination(index: number, raw: unknown): void { const banner = this.flow.draft.banners?.[index]; if (!this.flow.canEdit || !banner) return; banner.destination = ContentBannerDestination.fromWire(raw); this.flow.edit(); }
  toggleCategory(category: string, selected: boolean): void {
    if (!this.flow.canEdit || selected && !this.categories.includes(category)) return;
    this.flow.draft.categories = new SelectContentCategoryStep().execute(this.selectedCategories, category, selected, this.categories.includes(category)); this.flow.edit();
  }
  removeCategory(category: string): void {
    if (!this.flow.canEdit) return; const categories = this.selectedCategories, index = categories.indexOf(category), fallback = categories[index + 1] ?? categories[index - 1];
    this.toggleCategory(category, false); this.reorderAnnouncement.set('Categoría '+category+' eliminada.'); this.restoreRemovalFocus(MerchandisingItemKind.Category, fallback);
  }
  moveCategory(index: number, delta: number): void {
    if (!this.flow.canEdit) return; const category = this.selectedCategories[index]; if (!category) return;
    this.flow.draft.categories = new MoveContentItemStep().execute(this.selectedCategories, index, delta); this.flow.edit();
    const position = this.selectedCategories.indexOf(category); this.reorderAnnouncement.set(category+', categoría '+(position+1)+' de '+this.selectedCategories.length+'.');
    this.restoreMerchandisingFocus(MerchandisingItemKind.Category, category, delta);
  }
  moveBanner(index: number, delta: number): void {
    if (!this.flow.canEdit) return; const banner = this.flow.draft.banners?.[index]; if (!banner) return;
    this.flow.draft.banners = new MoveContentItemStep().execute(this.flow.draft.banners ?? [], index, delta); this.flow.edit();
    const position = this.flow.draft.banners.findIndex(value => value.id === banner.id); this.reorderAnnouncement.set(banner.title+', banner '+(position+1)+' de '+this.flow.draft.banners.length+'.');
    this.restoreMerchandisingFocus(MerchandisingItemKind.Banner, banner.id, delta);
  }
  invalidBannerTitle(index: number): boolean { return this.current.phase === ContentEditPhase.Invalid && this.current.issue === ContentDraftIssue.Banner && !this.current.draft.banners?.[index]?.title.trim(); }
  invalidBannerBody(index: number): boolean { return this.current.phase === ContentEditPhase.Invalid && this.current.issue === ContentDraftIssue.Banner && !this.current.draft.banners?.[index]?.body.trim(); }
  private restoreMerchandisingFocus(kind: MerchandisingItemKind, identity: string, delta: number): void {
    const epoch = this.state.sessionEpoch(); setTimeout(() => {
      if (!this.alive || epoch !== this.state.sessionEpoch()) return;
      const owner = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(kind.editorSelector)).find(element => element.dataset[kind.datasetKey] === identity);
      const preferred = owner?.querySelector<HTMLButtonElement>(`[data-cta="content-${kind.ctaSegment}-${delta < 0 ? 'up' : 'down'}"]`);
      const fallback = owner?.querySelector<HTMLButtonElement>(`[data-cta="content-${kind.ctaSegment}-${delta < 0 ? 'down' : 'up'}"]`);
      (preferred && !preferred.disabled ? preferred : fallback && !fallback.disabled ? fallback : undefined)?.focus();
    }, 0);
  }
  private restoreRemovalFocus(kind: MerchandisingItemKind, identity?: string): void {
    const epoch = this.state.sessionEpoch(); setTimeout(() => {
      if (!this.alive || epoch !== this.state.sessionEpoch()) return;
      const owner = identity ? Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(kind.editorSelector)).find(element => element.dataset[kind.datasetKey] === identity) : undefined;
      (owner?.querySelector<HTMLElement>(kind.ownerRemovalFocusSelector) ?? this.host.nativeElement.querySelector<HTMLElement>(kind.emptyRemovalFocusSelector))?.focus();
    }, 0);
  }
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
    const bannerIndex = this.flow.draft.banners?.findIndex(banner => !banner.title.trim() || !banner.body.trim()) ?? -1;
    const id = this.flow.issue === ContentDraftIssue.Banner && bannerIndex >= 0 ? (!this.flow.draft.banners![bannerIndex].title.trim() ? 'banner-title-' : 'banner-body-')+bannerIndex : this.flow.issue === ContentDraftIssue.Title ? 'content-title' : index >= 0 ? !this.flow.draft.blocks[index].title.trim() ? 'content-block-title-'+index : 'content-block-body-'+index : 'content-title';
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
