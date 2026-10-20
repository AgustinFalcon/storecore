import { Component, computed, inject, signal, DestroyRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DemoApplicationState } from './demo-state';
import { DemoProductEditorComponent } from './demo-product-editor';
import { DemoPostSaleComponent } from './demo-postsale.component';
import { DemoFulfillmentComponent } from './demo-fulfillment.component';
import { DemoInboxComponent } from './demo-inbox.component';
import { DemoAlertRead, DemoInboxPolicy } from './demo-inbox';
import { DemoMarketplaceComponent } from './demo-marketplace.component';
import { DemoMLAccountStatus, DemoMarketSignalRead, ensureMarketplace, ensureCompetitorDetails } from './demo-marketplace';
import { DemoAccessComponent } from './demo-access.component';
import { DemoAdminFilter, DemoAdminSort, DEMO_ADMIN_LIMIT } from './demo-admin-selection';
import { DemoFulfillmentPolicy, DemoIncidentKind, ensureFulfillment, DEMO_PICKUP_POINT } from './demo-fulfillment';
import { CheckoutStep, DemoAddress, DemoCampaign, DemoContext, DemoProduct, DemoScenario, DemoModuleId, DemoContentBlock, DemoSettings } from './demo-model';
import { DemoProductVariantRecord, DemoProductMedia } from './catalog/catalog-model';
import { DemoCampaignState } from './demo-config-types';
import { DemoRole } from './demo-roles';
import { DemoCheckoutFlow } from './checkout/demo-checkout-flow';
import { DemoDeliveryPolicy } from './checkout/demo-delivery-policy';
import { ProductCondition, ProductPublication } from './catalog/catalog-types';
import { DemoProductDraftEditor } from './catalog/product-draft-editor';
import { DemoProductPolicy } from './catalog/product-policy';
import { DemoScreen } from './demo-screen';
import { PaymentStatus } from '../domain/order/payment-status';
import { ShipmentStatus } from '../domain/order/shipment-status';
import { DemoPaymentMethod, DemoPaymentPhase, DemoDeliveryMethod, DemoMLTab, DemoSyncStatus, DemoCompetitor } from './demo-process-types';

export class DemoDialog {
  private constructor(readonly label: string) {}
  static readonly None = new DemoDialog('');
  static readonly Reset = new DemoDialog('Restablecer demostración');
  static readonly Product = new DemoDialog('Editar producto');
  static readonly Address = new DemoDialog('Dirección de entrega');
  static readonly Campaign = new DemoDialog('Oferta o campaña');
  static readonly Adjustment = new DemoDialog('Ajustar inventario');
  static readonly Information = new DemoDialog('Información');
  static readonly Confirm = new DemoDialog('Confirmar operación');
  static readonly Module = new DemoDialog('Configurar módulo');
  static readonly Tracking = new DemoDialog('Seguimiento de entrega');
  static readonly Receipt = new DemoDialog('Comprobante de demostración');
  static readonly Incident = new DemoDialog('Registrar incidencia');
  static readonly Zoom = new DemoDialog('Ampliar imagen');
  static readonly Unknown = new DemoDialog('Acción desconocida');
  static fromWire(raw: unknown): DemoDialog { return [this.None, this.Reset, this.Product, this.Address, this.Campaign, this.Adjustment, this.Information, this.Confirm, this.Module, this.Tracking, this.Receipt, this.Incident, this.Zoom].find(value => value.label === raw) ?? this.Unknown; }
}
export class CatalogSort {
  private constructor(readonly wire: string, readonly label: string, readonly compare: (left: DemoProduct, right: DemoProduct) => number) {}
  static readonly Featured = new CatalogSort('featured', 'Destacados', () => 0);
  static readonly PriceUp = new CatalogSort('price-up', 'Menor precio', (a, b) => a.price - b.price);
  static readonly PriceDown = new CatalogSort('price-down', 'Mayor precio', (a, b) => b.price - a.price);
  static readonly Name = new CatalogSort('name', 'Nombre A–Z', (a, b) => a.name.localeCompare(b.name));
  static readonly Unknown = new CatalogSort('', 'Orden desconocido', () => 0);
  static readonly all = [this.Featured, this.PriceUp, this.PriceDown, this.Name];
  static fromWire(raw: unknown): CatalogSort { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

@Component({ selector: 'sc-root', imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule], templateUrl: './demo-shell.html', styleUrl: './demo.scss' })
export class DemoRootComponent {
  readonly state = inject(DemoApplicationState);
  readonly router = inject(Router);
  readonly Context = DemoContext;
  readonly scenarios = DemoScenario.all;
  readonly navigation = DemoScreen.all.filter(screen => screen.admin && screen !== DemoScreen.AdminOrder);
  mobileOpen = false;
  resetOpen = false;
  private resetFocus: HTMLElement | null = null;
  query = '';
  get admin(): boolean { return this.router.url.startsWith('/demo/user'); }
  get count(): number { return this.state.context() === DemoContext.Customer ? this.state.actor.cart.reduce((sum, line) => sum + line.quantity, 0) : 0; }
  search(): void { void this.router.navigate(['/demo/catalog'], { queryParams: { q: this.query } }); }
  changeScenario(raw: string): void { this.state.scenario.set(DemoScenario.fromWire(raw)); }
  logout(): void { this.state.logout(); void this.router.navigate(['/demo/login']); }
  reload(): void { window.location.reload(); }
  openReset(): void { this.resetFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; document.querySelector<HTMLDialogElement>('#demo-reset-dialog')?.showModal(); }
  closeReset(): void { document.querySelector<HTMLDialogElement>('#demo-reset-dialog')?.close(); this.resetFocus?.focus(); }
  confirmReset(): void { this.state.reset(); this.closeReset(); void this.router.navigate(['/demo/login']); }
}

@Component({ selector: 'sc-demo-page', imports: [FormsModule, RouterLink, DemoProductEditorComponent, DemoPostSaleComponent, DemoFulfillmentComponent, DemoInboxComponent, DemoMarketplaceComponent, DemoAccessComponent], templateUrl: './demo-page.html', styleUrl: './demo.scss' })
export class DemoPageComponent {
  @ViewChild(DemoFulfillmentComponent) private fulfillment?: DemoFulfillmentComponent;
  readonly state = inject(DemoApplicationState);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly Screen = DemoScreen;
  readonly Context = DemoContext;
  readonly Dialog = DemoDialog;
  readonly Step = CheckoutStep;
  readonly Payment = PaymentStatus;
  readonly Shipment = ShipmentStatus;
  readonly Method = DemoPaymentMethod;
  readonly Phase = DemoPaymentPhase;
  readonly Delivery = DemoDeliveryMethod;
  readonly MLTab = DemoMLTab;
  readonly Sync = DemoSyncStatus;
  readonly paymentMethod = signal(DemoPaymentMethod.Card);
  readonly paymentPhase = signal(DemoPaymentPhase.Ready);
  readonly deliveryMethod = signal(DemoDeliveryMethod.Home);
  readonly mlTab = signal(DemoMLTab.Account);
  private paymentTimer: ReturnType<typeof setTimeout> | undefined;
  incidentReason = '';
  competitorName = '';
  competitorSku = 'DEMO-001';
  competitorThreshold = 1;
  readonly sorts = CatalogSort.all;
  readonly AdminFilter=DemoAdminFilter;
  readonly adminFilters=DemoAdminFilter.all;
  readonly adminSorts=DemoAdminSort.all;
  readonly adminFilter=signal(DemoAdminFilter.fromWire(this.route.snapshot.queryParamMap.get('filter')??'all'));
  readonly adminSort=signal(DemoAdminSort.Recent);
  readonly adminPage=signal(0);
  readonly adminLimit=DEMO_ADMIN_LIMIT;
  adminFilterChanged(raw:string):void {this.adminFilter.set(DemoAdminFilter.fromWire(raw));this.adminPage.set(0);}
  adminSortChanged(raw:string):void {this.adminSort.set(DemoAdminSort.fromWire(raw));this.adminPage.set(0);}
  get adminCount():number{return this.screen===DemoScreen.Customers?this.selectedCustomers.length:this.screen===DemoScreen.AdminCatalog||this.screen===DemoScreen.Inventory?this.selectedAdminProducts.length:this.screen===DemoScreen.AdminOrders?this.selectedOrders.length:this.screen===DemoScreen.Content?this.contentBlocks.filter(value=>!this.search()||`${value.title} ${value.body}`.toLowerCase().includes(this.search().toLowerCase())).length:this.selectedCampaigns.length;}
  get adminPageIndex():number{return Math.min(this.adminPage(),Math.max(0,Math.ceil(this.adminCount/this.adminLimit)-1));}
  adminSlice<T>(values:T[]):T[]{return values.slice(this.adminPageIndex*this.adminLimit,(this.adminPageIndex+1)*this.adminLimit);}
  get variants(): readonly DemoProductVariantRecord[] { return this.product ? this.state.commerce.variants(this.product.sku) : []; }
  readonly variantId = signal('');
  readonly imageId = signal('');
  get selectedVariant(): DemoProductVariantRecord | undefined { return this.variants.find(value => value.id === (this.variantId() || this.variants[0]?.id)); }
  get selectedStock(): number { return this.product && this.selectedVariant ? this.state.commerce.available(this.product.sku, this.selectedVariant.id) : 0; }
  get selectedPrice(): number { return this.product && this.selectedVariant ? this.state.commerce.price(this.product.sku, this.selectedVariant.id) : 0; }
  get galleryImages(): readonly DemoProductMedia[] { return this.selectedVariant?.outlet?.media ?? this.product?.media ?? []; }
  get selectedImage(): DemoProductMedia | undefined { return this.galleryImages.find(image => image.id === this.imageId()) ?? this.galleryImages[0]; }
  chooseImage(image: DemoProductMedia): void { this.imageId.set(image.id); }
  readonly Module = DemoModuleId;
  readonly pickupPoint = DEMO_PICKUP_POINT;
  private readonly checkoutFlow = new DemoCheckoutFlow();
  get deliveryMethods() { return DemoDeliveryPolicy.forCart(this.state.actor.cart, (sku, id) => this.state.commerce.catalog.variant(sku, id)); }
  get cartPickupLocation(): string | null { return DemoDeliveryPolicy.pickupLocation(this.state.actor.cart, (sku, id) => this.state.commerce.catalog.variant(sku, id)); }
  readonly Math = Math;
  readonly activeProduct = (product: DemoProduct): boolean => product.publication.published;
  readonly sampleManifest = JSON.stringify({ version: 1, title: 'Tu taller, mejor equipado' }, null, 2);
  readonly dialog = signal(DemoDialog.None);
  readonly step = signal(CheckoutStep.Address);
  readonly page = signal(0);
  readonly search = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  readonly category = signal(this.route.snapshot.queryParamMap.get('category') ?? '');
  readonly brand = signal('');
  readonly onlyAvailable = signal(false);
  readonly maxPrice = signal(0);
  readonly sort = signal(CatalogSort.Featured);
  readonly categories = computed(() => [...new Set(this.state.data.products.map(product => product.category))]);
  readonly brands = computed(() => [...new Set(this.state.data.products.map(product => product.brand))]);
  readonly filtered = computed(() => this.state.data.products.filter(product => product.publication.published && (!this.search() || `${product.name} ${product.sku}`.toLowerCase().includes(this.search().toLowerCase())) && (!this.category() || product.category === this.category()) && (!this.brand() || product.brand === this.brand()) && (!this.onlyAvailable() || this.state.commerce.available(product.sku) > 0) && (!this.maxPrice() || this.state.commerce.price(product.sku) <= this.maxPrice() * 100)).sort(this.sort().compare));
  readonly products = computed(() => this.filtered().slice(this.page() * 6, this.page() * 6 + 6));
  private request = crypto.randomUUID();
  private focusBeforeDialog: HTMLElement | null = null;
  private confirmation: (() => void) | null = null;
  quantity = 1;
  addressId = '';
  delivery = false;
  profileName = this.state.actor.firstName;
  profileLastName = this.state.actor.lastName;
  profilePhone = this.state.actor.phone;
  contentTitle = this.state.data.title;
  contentSubtitle = this.state.data.subtitle;
  contentBlocks: DemoContentBlock[] = this.state.data.blocks.map(block => ({ ...block }));
  draftSettings: DemoSettings = { ...this.state.data.settings };
  draftModule = DemoModuleId.Unknown;
  info = '';
  adjustmentSku = '';
  adjustmentVariantId = '';
  get adjustmentVariants(): DemoProductVariantRecord[] { return this.adjustmentSku ? this.state.commerce.variants(this.adjustmentSku) : []; }
  adjustmentDelta = 1;
  adjustmentReason = '';
  selectedOrderStatus: PaymentStatus | null = this.route.snapshot.queryParamMap.get('payment') ? PaymentStatus.fromWire(this.route.snapshot.queryParamMap.get('payment')) : null;
  private readonly draftEditor = new DemoProductDraftEditor(undefined, Array.from({length: 12}, (_, index) => `/assets/demo/DEMO-${String(index + 1).padStart(3, '0')}.svg`));
  private editingRevision = 0;
  draftProduct: DemoProduct = this.draftEditor.create();
  draftAddress: DemoAddress = { id: '', label: 'Casa', street: '', city: '', postal: '', primary: false };
  draftCampaign: DemoCampaign = { id: '', title: '', sku: '', percent: 10, state: DemoCampaignState.Active, from: '2026-10-08', until: '2027-12-31' };
  configName = 'Mi comercio';
  manifest = '';
  removed: { sku: string; quantity: number; variantId: string } | null = null;
  constructor() { inject(DestroyRef).onDestroy(() => clearTimeout(this.paymentTimer)); this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => { this.search.set(params.get('q') ?? ''); this.category.set(params.get('category') ?? ''); this.page.set(0); this.adminPage.set(0); this.adminFilter.set(DemoAdminFilter.fromWire(params.get('filter')??'all')); this.selectedOrderStatus=params.get('payment')?PaymentStatus.fromWire(params.get('payment')):null; }); this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => { this.variantId.set(''); this.imageId.set(''); this.quantity = 1; }); }
  get relatedProducts(): DemoProduct[] { return this.state.data.products.filter(value => value.publication.published && value.sku !== this.product?.sku && value.category === this.product?.category).slice(0,4); }
  productImage(product: DemoProduct): string { return product.media?.[0]?.src ?? '/assets/demo/product-placeholder.svg'; }
  get checkoutTotal(): number { return this.total + this.deliveryMethod().cost; }
  selectPayment(raw: string): void { this.paymentMethod.set(DemoPaymentMethod.fromWire(raw)); }
  selectDelivery(raw: string): void { this.deliveryMethod.set(DemoDeliveryMethod.fromWire(raw)); this.delivery = this.deliveryMethod() !== DemoDeliveryMethod.Unknown; }
  selectMLTab(tab: DemoMLTab): void { this.mlTab.set(tab); }
  mlKeyboard(event: KeyboardEvent): void { const index = DemoMLTab.all.indexOf(this.mlTab()); const next = event.key === 'ArrowRight' ? (index + 1) % DemoMLTab.all.length : event.key === 'ArrowLeft' ? (index + DemoMLTab.all.length - 1) % DemoMLTab.all.length : event.key === 'Home' ? 0 : event.key === 'End' ? DemoMLTab.all.length - 1 : -1; if (next < 0) return; event.preventDefault(); const tab = DemoMLTab.all[next]; this.mlTab.set(tab); setTimeout(() => document.getElementById(`ml-tab-${tab.wire}`)?.focus()); }
  get screen(): DemoScreen { return DemoScreen.fromWire(this.route.snapshot.data['screen']); }
  get allowed(): boolean { return this.screen.admin ? this.state.context() === DemoContext.Admin : !this.screen.privateCustomer || this.state.context() === DemoContext.Customer; }
  get product(): DemoProduct | undefined { this.state.revision(); return this.state.data.products.find(product => product.sku === this.route.snapshot.paramMap.get('sku')); }
  get order() { const order = this.state.data.orders.find(order => order.id === (this.route.snapshot.paramMap.get('id') ?? this.route.snapshot.paramMap.get('orderId'))); return this.screen.admin || order?.actor === this.state.actorId() ? order : undefined; }
  get selectedOrders() { const values=this.state.data.orders.filter(order => (this.screen.admin || order.actor === this.state.actorId()) && (!this.selectedOrderStatus || order.payment === this.selectedOrderStatus) && (!this.search() || `${order.id} ${order.actor} ${order.lines.map(line=>line.name).join(' ')}`.toLowerCase().includes(this.search().toLowerCase()))); return this.adminSort().apply(values); }
  get orders() {return this.screen.admin?this.adminSlice(this.selectedOrders):this.selectedOrders;}
  get cartLines() { return this.state.actor.cart.map(line => { const selected = this.state.commerce.catalog.variant(line.sku, line.variantId); return { ...line, variantId: selected.id, variantName: selected.label, attributes: selected.attributes, image: selected.outlet?.media.at(0) ?? this.state.commerce.product(line.sku).media.at(0), available: this.state.commerce.available(line.sku, selected.id), product: this.state.commerce.product(line.sku), unit: this.state.commerce.price(line.sku, selected.id) }; }); }
  get cartChanged(): boolean { return this.state.commerce.needsReconfirmation(this.state.actorId()); }
  refreshCart(): void { this.state.run(() => this.state.commerce.refreshCart(this.state.actorId()), 'Resumen actualizado. Revisá los importes antes de confirmar.'); }
  get total(): number { return this.cartLines.reduce((sum, line) => sum + line.unit * line.quantity, 0); }
  get revenue(): number { return this.state.data.orders.filter(order => order.payment === PaymentStatus.Approved).reduce((sum, order) => sum + order.total, 0); }
  get lowStock(): DemoProduct[] { return this.state.data.products.filter(product => this.state.commerce.available(product.sku) < this.state.data.settings.lowStockThreshold); }
  get lowVariantStock() { return this.state.data.products.filter(product=>product.publication.published).flatMap(product => this.state.commerce.variants(product.sku).filter(variant => variant.saleState.active && (variant.condition === ProductCondition.Standard || (variant.condition === ProductCondition.Outlet && variant.onHand > variant.notSellable)) && this.state.commerce.catalog.available(product.sku, variant.id) < this.state.data.settings.lowStockThreshold).map(variant => ({ product, variant }))); }
  get pendingOrders() { return this.state.data.orders.filter(order => (this.screen.admin || order.actor===this.state.actorId()) && order.payment === PaymentStatus.Pending); }
  get incidentOrders() { return this.state.data.orders.filter(order => (this.screen.admin || order.actor===this.state.actorId()) && !!order.incident); }
  get competitorAlerts(): number { return this.state.data.competitors.filter(value => value.unread).length; }
  get syncErrors(): number { return (this.state.data.syncJobs ?? []).filter(value => value.status === DemoSyncStatus.Failed).length; }
  get favoriteProducts(): DemoProduct[] { return this.state.data.products.filter(product => this.favorite(product.sku)); }
  get selectedAdminProducts(): DemoProduct[] { const values=this.state.data.products.filter(product => (!this.search() || `${product.name} ${product.sku} ${product.brand} ${product.category}`.toLowerCase().includes(this.search().toLowerCase()))&&(!this.category()||product.category===this.category())&&this.adminFilter().product(product,Math.min(...this.state.commerce.variants(product.sku).filter(variant=>variant.saleState.active).map(variant=>this.state.commerce.catalog.available(product.sku,variant.id))),this.state.data.settings.lowStockThreshold)); return this.adminSort().apply(values); }
  get selectedCustomers() { return this.state.data.actors.filter(actor => actor.role === DemoRole.Customer && (!this.search() || `${actor.firstName} ${actor.lastName} ${actor.email}`.toLowerCase().includes(this.search().toLowerCase()))).sort((left, right) => left.firstName.localeCompare(right.firstName)); }
  get customers() { return this.adminSlice(this.selectedCustomers); }
  customerOrders(id: string) { return this.state.data.orders.filter(order => order.actor === id); }
  get adminProducts(): DemoProduct[] {return this.adminSlice(this.selectedAdminProducts);}
  get selectedCampaigns():DemoCampaign[]{const values=this.state.data.campaigns.filter(value=>(!this.search()||`${value.title} ${value.sku}`.toLowerCase().includes(this.search().toLowerCase()))&&this.adminFilter().campaign(value));return this.adminSort().apply(values);}
  get adminCampaigns():DemoCampaign[]{return this.adminSlice(this.selectedCampaigns);}
  get visibleContentBlocks():DemoContentBlock[]{return this.adminSlice(this.contentBlocks.filter(value=>!this.search()||`${value.title} ${value.body}`.toLowerCase().includes(this.search().toLowerCase())));}
  contentIndex(block:DemoContentBlock):number{return this.contentBlocks.findIndex(value=>value.id===block.id);}
  listing(sku: string) { return this.state.data.listings.find(value => value.sku === sku); }
  get mlAccount() { return ensureMarketplace(this.state.data).account; }
  get mlLinkedCount(): number { return ensureMarketplace(this.state.data).mappings.filter(mapping => mapping.status.eligible).length; }
  filterOrders(raw: string): void { this.selectedOrderStatus = raw ? PaymentStatus.fromWire(raw) : null; }
  changeSort(raw: string): void { this.sort.set(CatalogSort.fromWire(raw)); this.page.set(0); }
  movements(product: DemoProduct): void { const rows = this.state.data.movements.filter(value => value.sku === product.sku); this.information(rows.length ? rows.map(value => `${value.delta > 0 ? '+' : ''}${value.delta} unidades · ${value.reason}`).join('\n') : 'Sin movimientos posteriores al stock inicial de demostración.'); }
  competitorHistory(history: number[]): void { this.information('Historial simulado: ' + history.map(value => this.money(value)).join(' → ')); }
  money(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value / 100); }
  stock(product: DemoProduct): number { return this.state.commerce.available(product.sku); }
  adjustable(product: DemoProduct): boolean { return product.variants.some(variant => variant.condition === ProductCondition.Standard); }
  favorite(sku: string): boolean { return this.state.context() === DemoContext.Customer && this.state.actor.favorites.includes(sku); }
  clearFilters(): void { this.search.set(''); this.category.set(''); this.brand.set(''); this.maxPrice.set(0); this.onlyAvailable.set(false); this.page.set(0); }
  access(): void { this.state.rememberIntent(this.router.url.split('?')[0]); void this.router.navigate(['/demo/login']); }
  toggleFavorite(sku: string): void { if (this.state.context() !== DemoContext.Customer) { this.access(); return; } this.state.run(() => this.state.commerce.favorite(this.state.actorId(), sku), 'Favoritos actualizados.'); }
  selectVariant(raw: string): void { this.variantId.set(raw); this.imageId.set(''); this.quantity = 1; }
  add(product: DemoProduct): void { if (this.state.context() !== DemoContext.Customer) { this.access(); return; } const selected = this.selectedVariant; if (!selected) { this.state.error.set('Seleccioná una variante disponible.'); return; } this.state.run(() => this.state.commerce.add(this.state.actorId(), product.sku, this.quantity, selected.id), `${product.name} · ${selected.label} agregado a tu carrito.`); }
  setQuantity(sku: string, raw: number | null, variantId: string): void { this.state.run(() => this.state.commerce.setQuantity(this.state.actorId(), sku, raw ?? Number.NaN, variantId), 'Carrito actualizado.'); }
  remove(sku: string, variantId: string): void { const removed = this.state.actor.cart.find(line => line.sku === sku && line.variantId === variantId) ?? null; if (this.state.run(() => this.state.commerce.remove(this.state.actorId(), sku, variantId), 'Producto quitado del carrito.')) this.removed = removed; }
  restore(): void { const removed = this.removed; if (removed && this.state.run(() => this.state.commerce.add(this.state.actorId(), removed.sku, removed.quantity, removed.variantId), 'Producto restaurado.')) this.removed = null; }
  nextStep(): void { const result = this.checkoutFlow.advance(this.step(), this.deliveryMethod(), this.delivery, this.state.actor.addresses, this.addressId); this.state.error.set(result.issue.message); this.step.set(result.step); }
  checkout(): void {
    if (this.paymentPhase() === DemoPaymentPhase.Processing) return;
    const issue = this.checkoutFlow.validateSubmission(this.paymentMethod(), this.deliveryMethod()); if (issue.message) { this.state.error.set(issue.message); return; }
    const actorId = this.state.actorId(), addressId = this.addressId, scenario = this.state.scenario(), method = this.paymentMethod(), delivery = this.deliveryMethod();
    this.paymentPhase.set(DemoPaymentPhase.Processing);
    this.paymentTimer = setTimeout(() => { let id = ''; if (this.state.run(() => { id = this.state.commerce.checkout(actorId, this.request, addressId, scenario, method, delivery).id; }, 'Pedido registrado.')) void this.router.navigate(['/demo/checkout/result', id]); this.paymentPhase.set(DemoPaymentPhase.Ready); }, 750);
  }
  cancelProcessing(): void { clearTimeout(this.paymentTimer); this.paymentPhase.set(DemoPaymentPhase.Cancelled); }
  cancelPayment(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.cancelPayment(order.id), 'Pago cancelado. Reserva de stock liberada.'); }
  saveIncident(): void { const order = this.order; if (order && this.state.run(() => this.state.commerce.reportIncident(order.id, this.incidentReason), 'Incidencia registrada y visible en seguimiento.')) this.close(); }
  resolveIncident(): void { this.fulfillment?.requestResolution(); }
  receiptText(): string { const order = this.order; if (!order) return ''; return ['COMPROBANTE DEMO — NO FISCAL', order.id, `Pago ${order.payment.label} · ${order.method?.label ?? DemoPaymentMethod.Card.label}`, order.address, ...order.lines.map(line => `${line.name} × ${line.quantity} · ${this.money(line.unit * line.quantity)}`), `Entrega ${this.money(order.delivery?.cost ?? 0)}`, `TOTAL ${this.money(order.total)}`, ...this.state.data.returns.filter(request => request.orderId === order.id).filter(request => !!request.refundId).map(request => `REINTEGRO ${request.refundId}: ${this.money(request.lines.reduce((sum, line) => sum + line.refund, 0))}`), 'Sin cobro real ni validez fiscal.'].join('\n'); }
  downloadReceipt(): void { const url = URL.createObjectURL(new Blob([this.receiptText()], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `comprobante-demo-${this.order?.id}.txt`; anchor.click(); URL.revokeObjectURL(url); }
  printReceipt(): void { window.print(); }
  resolvePayment(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.resolvePayment(order.id, this.state.scenario()), 'Pago simulado actualizado.'); }
  retryOrder(): void { const order = this.order; if (!order) return; if (this.state.run(() => this.state.commerce.retryOrder(this.state.actorId(), order.id), 'Productos recuperados en tu carrito. Revisá y aceptá cualquier cambio de precio.')) void this.router.navigate(['/demo/cart']); }
  open(dialog: DemoDialog): void { this.focusBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : null; this.dialog.set(dialog); setTimeout(() => document.querySelector<HTMLDialogElement>('#demo-page-dialog')?.showModal()); }
  close(): void { document.querySelector<HTMLDialogElement>('#demo-page-dialog')?.close(); this.dialog.set(DemoDialog.None); this.focusBeforeDialog?.focus(); }
  information(text: string): void { this.info = text; this.open(DemoDialog.Information); }
  confirm(text: string, action: () => void): void { this.info = text; this.confirmation = action; this.open(DemoDialog.Confirm); }
  performConfirmation(): void { const action = this.confirmation; this.confirmation = null; this.close(); action?.(); }
  editingSku: string | undefined;
  editProduct(product?: DemoProduct): void { this.editingSku = product?.sku; this.editingRevision = this.state.data.revision; this.draftProduct = product ? DemoProductPolicy.clone(product) : this.draftEditor.create(`DEMO-${String(this.state.data.products.length + 1).padStart(3, '0')}`); this.draftProduct.media = this.draftProduct.media.map(media => ({...media, src: media.src.replace(/\.jpg$/, '.svg')})); this.open(DemoDialog.Product); }
  saveProduct(): void { const product = DemoProductPolicy.clone(this.draftProduct); this.state.commerce.catalog.refreshTotals(product); if (this.state.run(() => this.state.commerce.saveProduct(product, this.editingSku, this.editingRevision), `Producto ${product.sku} guardado.`)) this.close(); }
  archive(product: DemoProduct): void { this.state.run(() => this.state.commerce.saveProduct({ ...DemoProductPolicy.clone(product), publication: product.publication.next }, product.sku, this.state.data.revision), product.publication === ProductPublication.Published ? 'Producto archivado; ya no aparece en tienda.' : 'Producto publicado en tienda.'); }
  editAddress(address?: DemoAddress): void { this.draftAddress = address ? { ...address } : { id: crypto.randomUUID(), label: 'Casa', street: '', city: '', postal: '', primary: false }; this.open(DemoDialog.Address); }
  saveAddress(): void { if (this.state.run(() => this.state.commerce.saveAddress(this.state.actorId(), this.draftAddress), 'Dirección guardada.')) this.close(); else this.formError(this.state.error()); }
  deleteAddress(address: DemoAddress): void { this.state.run(() => this.state.commerce.deleteAddress(this.state.actorId(), address.id), 'Dirección eliminada.'); }
  primary(address: DemoAddress): void { this.state.run(() => this.state.commerce.primaryAddress(this.state.actorId(), address.id), 'Dirección principal actualizada.'); }
  saveProfile(): void { if (!this.state.run(() => this.state.commerce.saveProfile(this.state.actorId(), { firstName: this.profileName, lastName: this.profileLastName, phone: this.profilePhone }), 'Perfil actualizado.')) this.formError(this.state.error()); }
  formError(message: string): void { this.state.error.set(message); setTimeout(()=>{ const summary=document.querySelector<HTMLElement>('dialog[open] [role="alert"]') ?? document.querySelector<HTMLElement>('[role="alert"]');summary?.setAttribute('tabindex','-1');summary?.focus(); }); }
  cancelProfile(): void { this.profileName = this.state.actor.firstName; this.profileLastName = this.state.actor.lastName; this.profilePhone = this.state.actor.phone; }
  saveContent(): void { if (!this.state.run(() => this.state.commerce.saveContent(this.contentTitle, this.contentSubtitle, this.contentBlocks), 'Contenido publicado en la tienda.')) this.formError(this.state.error()); }
  cancelContent(): void { this.contentTitle = this.state.data.title; this.contentSubtitle = this.state.data.subtitle; this.contentBlocks = this.state.data.blocks.map(block => ({ ...block })); }
  reorderContent(index: number, direction: number): void { const target = index + direction; if (target < 0 || target >= this.contentBlocks.length) return; const blocks = [...this.contentBlocks]; [blocks[index], blocks[target]] = [blocks[target], blocks[index]]; this.contentBlocks = blocks; }
  editCampaign(campaign?: DemoCampaign): void { this.draftCampaign = campaign ? { ...campaign } : { ...this.draftCampaign, id: crypto.randomUUID(), title: '', sku: this.state.data.products[0].sku }; this.open(DemoDialog.Campaign); }
  saveCampaign(): void { if (this.state.run(() => this.state.commerce.saveCampaign(this.draftCampaign), 'Oferta guardada; el precio efectivo se actualiza en tienda.')) this.close(); else this.formError(this.state.error()); }
  toggleCampaign(campaign: DemoCampaign): void { this.state.run(() => this.state.commerce.saveCampaign({ ...campaign, state: campaign.state.next }), 'Vigencia de la oferta actualizada.'); }
  adjust(product: DemoProduct): void { this.adjustmentSku = product.sku; this.adjustmentVariantId = this.state.commerce.variants(product.sku)[0].id; this.adjustmentDelta = 1; this.adjustmentReason = ''; this.open(DemoDialog.Adjustment); }
  saveAdjustment(): void { if (this.state.run(() => this.state.commerce.adjust(this.adjustmentSku, Number(this.adjustmentDelta), this.adjustmentReason, this.adjustmentVariantId), 'Movimiento de inventario registrado.')) this.close(); }
  advance(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.advance(order.id), 'Estado de entrega actualizado.'); }
  get canAdvance(): boolean { return !!this.order && new DemoFulfillmentPolicy().actions(this.order).length > 0 && ensureFulfillment(this.order).incident === DemoIncidentKind.None; }
  get advanceLabel(): string { return this.order ? new DemoFulfillmentPolicy().actions(this.order)[0]?.label ?? 'Entrega finalizada' : 'Entrega no disponible'; }
  get canResolveIncident(): boolean { return !!this.order && ensureFulfillment(this.order).incident === DemoIncidentKind.Report; }
  shipmentLabel(order: import('./demo-model').DemoOrder): string { return ensureFulfillment(order).phase.label; }
  connectML(): void { this.state.run(() => this.state.commerce.setMLAccount(ensureMarketplace(this.state.data).account === DemoMLAccountStatus.Authorized ? DemoMLAccountStatus.Disconnected : DemoMLAccountStatus.Authorized), this.state.data.mlConnected ? 'Cuenta simulada desconectada.' : 'Cuenta simulada conectada.'); }
  linkML(sku: string): void { this.state.run(() => { const mapping = ensureMarketplace(this.state.data).mappings.find(value => value.sku === sku); if (mapping?.status.eligible) this.state.commerce.unlinkML(mapping.id); else { const variant = this.state.commerce.variants(sku)[0]; this.state.commerce.mapML(sku, variant.id, `SIM-${sku}`, `SIM-${variant.id}`); } }, 'Vínculo simulado actualizado.'); }
  saleML(sku: string): void { this.state.run(() => this.state.commerce.mlSale(sku, `ml-sale-${sku}`), 'Venta simulada registrada (repetir la misma operación no duplica stock).'); }
  simulateCompetitor(competitor = this.state.data.competitors[0]): void { if (competitor) this.state.run(() => this.state.commerce.competitorPrice(competitor.id, Math.max(100, competitor.price - Math.max(10000, Math.round(competitor.price * .1)))), 'Precio de muestra actualizado; revisá el historial y las alertas.'); }
  watchCompetitor(): void { if (this.state.run(() => this.state.commerce.watchCompetitor(this.competitorName, this.competitorSku, Number(this.competitorThreshold)), 'Competidor agregado a seguimiento simulado.')) this.competitorName = ''; }
  toggleCompetitor(competitor: DemoCompetitor): void { this.state.run(() => { this.state.commerce.requireAdminAccess(this.state.actorId()); competitor.enabled = competitor.enabled === false; this.state.commerce.touch(); }, 'Preferencia de alertas actualizada.'); }
  removeCompetitor(competitor: DemoCompetitor): void { this.state.run(() => { this.state.commerce.requireAdminAccess(this.state.actorId()); this.state.data.competitors = this.state.data.competitors.filter(value => value.id !== competitor.id); this.state.commerce.touch(); }, 'Competidor eliminado del seguimiento.'); }
  processStock(): void { this.state.run(() => this.state.commerce.processStock(this.state.scenario() === DemoScenario.Error), 'Cola de sincronización simulada procesada.'); }
  acknowledge(): void { this.state.run(() => { this.state.commerce.requireAdminAccess(this.state.actorId()); this.state.data.competitors.forEach(value => { value.unread = false; ensureCompetitorDetails(value, this.state.data).signals.forEach(signal => signal.read = DemoMarketSignalRead.Read); }); const inbox = new DemoInboxPolicy(); for (const alert of this.state.data.inbox?.alerts ?? []) if (alert.audience === 'admin' && alert.id.startsWith('admin:competitor:')) inbox.mark(this.state.data, 'admin', alert.id, DemoAlertRead.Read); this.state.commerce.touch(); }, 'Alertas marcadas como leídas.'); }
  moduleToggle(id: DemoModuleId): void { this.confirm(`Cambiar el estado de ${id.label} afecta sus operaciones simuladas.`, () => this.state.run(() => this.state.commerce.setModule(id), 'Estado del módulo demo guardado.')); }
  configureModule(id: DemoModuleId): void { this.draftModule = id; this.draftSettings = { ...this.state.data.settings }; this.open(DemoDialog.Module); }
  saveModule(): void { if (this.draftModule === DemoModuleId.Unknown) { this.state.error.set('Módulo no reconocido.'); return; } if (this.state.run(() => this.state.commerce.saveSettings(this.draftSettings), `${this.draftModule.label}: configuración guardada.`)) this.close(); }
  validateManifest(): void { try { const parsed: unknown = JSON.parse(this.manifest); if (!parsed || typeof parsed !== 'object' || !('title' in parsed) || typeof parsed.title !== 'string') throw new Error('El perfil requiere un título de comercio.'); this.information(`Perfil válido. Nuevo título: ${parsed.title}. La importación actualiza solamente el contenido de esta demo.`); } catch { this.state.error.set('El perfil no es JSON válido o le falta title.'); } }
  importManifest(): void { this.state.run(() => { const parsed: unknown = JSON.parse(this.manifest); if (!parsed || typeof parsed !== 'object' || !('title' in parsed) || typeof parsed.title !== 'string' || !parsed.title.trim()) throw new Error('Perfil inválido.'); this.state.commerce.importProfile(parsed.title); }, 'Perfil importado en la demo.'); }
  exportProfile(): void { const blob = new Blob([JSON.stringify({ version: 1, title: this.state.data.title, subtitle: this.state.data.subtitle }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'comercio-demo.json'; anchor.click(); URL.revokeObjectURL(url); }
}
