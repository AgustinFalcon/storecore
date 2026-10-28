import { Component, effect, computed, inject, signal, DestroyRef, afterNextRender, Injector } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DemoApplicationState } from './demo-state';
import { CatalogSort, CheckoutStep, DemoAddress, DemoCampaign, DemoContext, DemoProduct, DemoScenario, DemoGalleryView, DemoProductVariant, DemoModuleId, DemoSettings } from './demo-model';
import { DemoScreen } from './demo-screen';
import { PaymentStatus, ShipmentStatus } from '../domain/order/commerce-states';
import { DemoPaymentMethod, DemoPaymentPhase, DemoDeliveryMethod, DemoMLTab, DemoSyncStatus, DemoCompetitor } from './demo-process-types';
import { CatalogStockScope, DemoCatalogLocation, type DemoCatalogCriteria } from './catalog/demo-catalog-location';
import { DemoCatalogPresenter } from './catalog/demo-catalog-presenter';
import { trapDemoDialogFocus } from './demo-dialog-focus';

import { UserRole } from '../domain/user/user-role';
import { AccessSelectionPurpose, DemoAccessContinuation, PurchaseCaptureStatus } from './identity/demo-access-continuation';
import { DemoProductSelection } from './catalog/demo-product-selection';
import { demoProductImage } from './catalog/demo-product-image';
import { demoMoney } from './demo-money';
import { DemoCheckoutFlow, DemoCheckoutIssue, type CheckoutFacts } from './checkout/demo-checkout-flow';
import { DeliveryConfirmation, DemoDeliveryAcceptance, DemoDeliveryQuote } from './checkout/demo-delivery-quote';

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
  static readonly Unknown = new DemoDialog('Acción desconocida');
  static fromWire(raw: unknown): DemoDialog { return [this.None, this.Reset, this.Product, this.Address, this.Campaign, this.Adjustment, this.Information, this.Confirm, this.Module, this.Tracking, this.Receipt, this.Incident].find(value => value.label === raw) ?? this.Unknown; }
}
@Component({ selector: 'sc-root', imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule], templateUrl: './demo-shell.html', styleUrl: './demo.scss' })
export class DemoRootComponent {
  readonly trapFocus = trapDemoDialogFocus;
  readonly state = inject(DemoApplicationState);
  readonly router = inject(Router);
  readonly Role = UserRole;
  readonly Context = DemoContext;
  readonly scenarios = DemoScenario.all;
  readonly navigation = DemoScreen.all.filter(screen => screen.admin && screen !== DemoScreen.AdminOrder);
  mobileOpen = false;
  adminMenuOpen = false;
  private adminMenuFocus: HTMLElement | null = null;
  resetOpen = false;
  private resetFocus: HTMLElement | null = null;
  query = '';
  get admin(): boolean { return this.router.url.startsWith('/demo/user'); }
  get count(): number { return this.state.context() === DemoContext.Customer ? this.state.actor.cart.reduce((sum, line) => sum + line.quantity, 0) : 0; }
  search(): void { void this.router.navigate(['/demo/catalog'], { queryParams: { q: this.query } }); }
  changeScenario(raw: string): void { this.state.scenario.set(DemoScenario.fromWire(raw)); }
  logout(): void { this.state.logout(); void this.router.navigate(['/demo/login']); }
  reload(): void { window.location.reload(); }
  openAdminMenu(): void { this.adminMenuFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; this.adminMenuOpen = true; document.querySelector<HTMLDialogElement>('#demo-admin-navigation')?.showModal(); }
  closeAdminMenu(): void { document.querySelector<HTMLDialogElement>('#demo-admin-navigation')?.close(); this.adminMenuOpen = false; this.adminMenuFocus?.focus(); }
  openReset(): void { this.resetFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; document.querySelector<HTMLDialogElement>('#demo-reset-dialog')?.showModal(); }
  closeReset(): void { document.querySelector<HTMLDialogElement>('#demo-reset-dialog')?.close(); this.resetFocus?.focus(); }
  confirmReset(): void { if (this.state.reset()) { this.closeReset(); void this.router.navigate(['/demo/login']); } }
}

@Component({ selector: 'sc-demo-page', imports: [FormsModule, RouterLink], templateUrl: './demo-page.html', styleUrl: './demo.scss' })
export class DemoPageComponent {
  readonly Role = UserRole;
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
  readonly DeliveryConfirmation = DeliveryConfirmation;
  readonly CheckoutIssue = DemoCheckoutIssue;
  readonly checkoutIssue = signal(DemoCheckoutIssue.None);
  private readonly checkoutFlow = new DemoCheckoutFlow();
  private readonly deliveryAcceptance = new DemoDeliveryAcceptance();
  private readonly injector = inject(Injector);
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
  readonly CatalogStock = CatalogStockScope;
  readonly Gallery = DemoGalleryView;
  readonly gallery = signal(DemoGalleryView.Front);
  get variants(): readonly DemoProductVariant[] { return this.product?.supportsCase === true ? DemoProductVariant.all : [DemoProductVariant.Standard]; }
  readonly variant = signal(DemoProductVariant.Standard);
  readonly Module = DemoModuleId;
  readonly Math = Math;
  readonly activeProduct = (product: DemoProduct): boolean => product.active;
  readonly sampleManifest = JSON.stringify({ version: 1, title: 'Tu taller, mejor equipado' }, null, 2);
  readonly dialog = signal(DemoDialog.None);
  readonly step = signal(CheckoutStep.Address);
  readonly page = signal(0);
  readonly search = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  readonly category = signal(this.route.snapshot.queryParamMap.get('category') ?? '');
  readonly brand = signal('');
  readonly stockScope = signal(CatalogStockScope.All);
  readonly maxPrice = signal<number | null>(null);
  readonly sort = signal(CatalogSort.Featured);
  private readonly catalogPresenter = new DemoCatalogPresenter();
  private readonly catalogLocation = new DemoCatalogLocation();
  private readonly continuation = new DemoAccessContinuation();
  readonly categories = computed(() => [...new Set(this.state.data.products.map(product => product.category))]);
  readonly brands = computed(() => [...new Set(this.state.data.products.map(product => product.brand))]);
  readonly filtered = computed(() => this.catalogPresenter.filter(this.state.data.products, this.catalogCriteria, product => this.state.commerce.available(product.sku), product => this.state.commerce.price(product.sku)));
  readonly effectivePage = computed(() => this.catalogPresenter.pageIndex(this.filtered().length, this.page()));
  readonly catalogPageCount = computed(() => this.catalogPresenter.pageCount(this.filtered().length));
  readonly products = computed(() => this.catalogPresenter.page(this.filtered(), this.page()));
  readonly catalogLocationIssue = computed(() => this.sort() === CatalogSort.Unknown || this.stockScope() === CatalogStockScope.Unknown);
  private request = crypto.randomUUID();
  private focusBeforeDialog: HTMLElement | null = null;
  private confirmation: (() => void) | null = null;
  private confirmationEpoch = -1;
  email = 'cliente@demo.invalid';
  password = '';
  showPassword = false;
  chooseContext = false;
  quantity = 1;
  addressId = '';
  get delivery(): boolean { return this.deliveryConfirmation === DeliveryConfirmation.Confirmed; }
  set delivery(confirmed: boolean) { if (confirmed) this.deliveryAcceptance.confirm(this.deliveryQuote, this.checkoutCartIdentity); else this.deliveryAcceptance.reset(); this.checkoutIssue.set(DemoCheckoutIssue.None); }
  get deliveryQuote(): DemoDeliveryQuote { return DemoDeliveryQuote.create(this.deliveryMethod(), this.state.actor.addresses.find(value => value.id === this.addressId), this.state.data.settings.deliveryDays); }
  private get checkoutCartIdentity(): string { return JSON.stringify([this.state.actorId(), this.state.sessionEpoch(), this.cartLines.map(line => [line.sku, line.variant.wire, line.quantity, line.unit])]); }
  get deliveryConfirmation(): DeliveryConfirmation { return this.deliveryAcceptance.state(this.deliveryQuote, this.checkoutCartIdentity); }
  private get checkoutFacts(): CheckoutFacts { return { quote: this.deliveryQuote, confirmation: this.deliveryConfirmation, hasItems: this.cartLines.length > 0 }; }
  profileName = this.state.actor.firstName;
  profileLastName = this.state.actor.lastName;
  profilePhone = this.state.actor.phone;
  draftSettings: DemoSettings = { ...this.state.data.settings };
  draftModule = DemoModuleId.Unknown;
  info = '';
  adjustmentSku = '';
  adjustmentDelta = 1;
  adjustmentReason = '';
  selectedOrderStatus: PaymentStatus | null = null;
  draftProduct: DemoProduct = { sku: '', name: '', category: 'Herramientas', brand: 'Norte', description: '', price: 10000, original: 10000, onHand: 1, reserved: 0, active: true, tone: '#e6a63f', variant: 'Estándar', supportsCase: false };
  draftAddress: DemoAddress = { id: '', label: 'Casa', street: '', city: '', postal: '', primary: false };
  draftCampaign: DemoCampaign = { id: '', title: '', sku: '', percent: 10, active: true, from: '2026-10-08', until: '2027-12-31' };
  configName = 'Mi comercio';
  manifest = '';
  removed: { sku: string; quantity: number; variant: DemoProductVariant } | null = null;
  constructor() { effect(() => { this.state.sessionEpoch(); this.deliveryAcceptance.reset(); clearTimeout(this.paymentTimer); this.paymentPhase.set(DemoPaymentPhase.Ready); this.confirmation = null; this.close(); }); inject(DestroyRef).onDestroy(() => clearTimeout(this.paymentTimer)); this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => { this.restoreProductSelection(); if (this.screen !== DemoScreen.Catalog && this.screen !== DemoScreen.Product) return; const criteria = this.catalogLocation.fromQuery(params); this.search.set(criteria.search); this.category.set(criteria.category); this.brand.set(criteria.brand); this.stockScope.set(criteria.stock); this.maxPrice.set(criteria.maxPrice); this.sort.set(criteria.sort); this.page.set(criteria.page); }); this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => { this.restoreProductSelection(); this.gallery.set(DemoGalleryView.Front); }); }
  get relatedProducts(): DemoProduct[] { return this.state.data.products.filter(value => value.active && value.sku !== this.product?.sku && value.category === this.product?.category).slice(0,4); }
  readonly productImage = demoProductImage;
  get checkoutTotal(): number { return this.total + (this.deliveryQuote.valid ? this.deliveryQuote.cost : 0); }
  selectPayment(raw: string): void { this.paymentMethod.set(DemoPaymentMethod.fromWire(raw)); }
  selectDelivery(raw: string): void { const method = DemoDeliveryMethod.fromWire(raw); if (method !== this.deliveryMethod()) this.deliveryAcceptance.reset(); this.deliveryMethod.set(method); this.checkoutIssue.set(DemoCheckoutIssue.None); }
  selectCheckoutAddress(id: string): void { if (id !== this.addressId) this.deliveryAcceptance.reset(); this.addressId = id; this.checkoutIssue.set(DemoCheckoutIssue.None); }
  private focusCheckout(id: string): void { afterNextRender(() => (document.getElementById(id) ?? document.getElementById('checkout-destination-control'))?.focus(), { injector: this.injector }); }
  keepCheckoutFocusVisible(event: FocusEvent): void { const target = event.target; const strip = document.querySelector('.checkout-total-strip'); if (!(target instanceof HTMLElement) || !strip) return; const top = target.getBoundingClientRect().top, bottom = strip.getBoundingClientRect().bottom; if (top < bottom + 12) window.scrollBy(0, top - bottom - 12); }
  checkoutStep(step: CheckoutStep): void { if (this.paymentPhase() === DemoPaymentPhase.Processing) return; this.checkoutIssue.set(DemoCheckoutIssue.None); this.step.set(step); this.focusCheckout('checkout-stage-title'); }
  private showCheckoutIssue(issue: DemoCheckoutIssue): void { this.checkoutIssue.set(issue); this.focusCheckout(issue === DemoCheckoutIssue.MissingAddress ? 'checkout-addresses' : issue === DemoCheckoutIssue.MissingDelivery ? 'checkout-delivery-confirm' : issue === DemoCheckoutIssue.MissingPayment ? 'checkout-payment-control' : 'checkout-stage-title'); }
  selectMLTab(tab: DemoMLTab): void { this.mlTab.set(tab); }
  mlKeyboard(event: KeyboardEvent): void { const index = DemoMLTab.all.indexOf(this.mlTab()); const next = event.key === 'ArrowRight' ? (index + 1) % DemoMLTab.all.length : event.key === 'ArrowLeft' ? (index + DemoMLTab.all.length - 1) % DemoMLTab.all.length : event.key === 'Home' ? 0 : event.key === 'End' ? DemoMLTab.all.length - 1 : -1; if (next < 0) return; event.preventDefault(); const tab = DemoMLTab.all[next]; this.mlTab.set(tab); setTimeout(() => document.getElementById(`ml-tab-${tab.wire}`)?.focus()); }
  get screen(): DemoScreen { return DemoScreen.fromWire(this.route.snapshot.data['screen']); }
  get allowed(): boolean { return this.screen.admin ? this.state.context() === DemoContext.Admin && (this.state.role() === UserRole.Admin || (this.state.role() === UserRole.Operator && this.screen === DemoScreen.AdminOrder)) : !this.screen.privateCustomer || this.state.context() === DemoContext.Customer; }
  get product(): DemoProduct | undefined { this.state.revision(); return this.state.data.products.find(product => product.sku === this.route.snapshot.paramMap.get('sku')); }
  get order() { const order = this.state.data.orders.find(order => order.id === (this.route.snapshot.paramMap.get('id') ?? this.route.snapshot.paramMap.get('orderId'))); return this.screen.admin || order?.actor === this.state.actorId() ? order : undefined; }
  get orders() { return this.state.data.orders.filter(order => (this.screen.admin || order.actor === this.state.actorId()) && (!this.selectedOrderStatus || order.payment === this.selectedOrderStatus) && (!this.search() || order.id.toLowerCase().includes(this.search().toLowerCase()))); }
  get cartLines() { return this.state.actor.cart.map(line => ({ ...line, product: this.state.commerce.product(line.sku), unit: this.state.commerce.price(line.sku) + line.variant.extraUnit })); }
  get total(): number { return this.cartLines.reduce((sum, line) => sum + line.unit * line.quantity, 0); }
  get revenue(): number { return this.state.data.orders.filter(order => order.payment === PaymentStatus.Approved).reduce((sum, order) => sum + order.total, 0); }
  get lowStock(): DemoProduct[] { return this.state.data.products.filter(product => this.state.commerce.available(product.sku) < this.state.data.settings.lowStockThreshold); }
  get pendingOrders() { return this.orders.filter(order => order.payment === PaymentStatus.Pending); }
  get incidentOrders() { return this.orders.filter(order => !!order.incident); }
  get competitorAlerts(): number { return this.state.data.competitors.filter(value => value.unread).length; }
  get syncErrors(): number { return (this.state.data.syncJobs ?? []).filter(value => value.status === DemoSyncStatus.Failed).length; }
  get favoriteProducts(): DemoProduct[] { return this.state.data.products.filter(product => this.favorite(product.sku)); }
  get adminProducts(): DemoProduct[] { return this.state.data.products.filter(product => !this.search() || `${product.name} ${product.sku}`.toLowerCase().includes(this.search().toLowerCase())); }
  listing(sku: string) { return this.state.data.listings.find(value => value.sku === sku); }
  filterOrders(raw: string): void { this.selectedOrderStatus = raw ? PaymentStatus.fromWire(raw) : null; }
  private get catalogCriteria(): DemoCatalogCriteria { return { search: this.search(), category: this.category(), brand: this.brand(), stock: this.stockScope(), maxPrice: this.maxPrice(), sort: this.sort(), page: this.page() }; }
  get catalogQueryParams(): Record<string, string | number | null> { return this.catalogLocation.toQuery({ ...this.catalogCriteria, page: this.effectivePage() }); }
  updateCatalog(): void { this.page.set(0); void this.router.navigate([], { relativeTo: this.route, queryParams: this.catalogLocation.toQuery({ ...this.catalogCriteria, page: 0 }), replaceUrl: true }); }
  changeCatalogPage(next: number): void { this.page.set(this.catalogPresenter.pageIndex(this.filtered().length, next)); void this.router.navigate([], { relativeTo: this.route, queryParams: this.catalogQueryParams }); }
  changeSort(raw: string): void { this.sort.set(CatalogSort.fromWire(raw)); this.updateCatalog(); }
  changeMaximum(raw: number | null): void { const value = Number(raw); this.maxPrice.set(raw !== null && Number.isFinite(value) && value >= 0 ? value : null); this.updateCatalog(); }
  changeStock(available: boolean): void { this.stockScope.set(available ? CatalogStockScope.Available : CatalogStockScope.All); this.updateCatalog(); }
  movements(product: DemoProduct): void { const rows = this.state.data.movements.filter(value => value.sku === product.sku); this.information(rows.length ? rows.map(value => `${value.delta > 0 ? '+' : ''}${value.delta} unidades · ${value.reason}`).join('\n') : 'Sin movimientos posteriores al stock inicial de demostración.'); }
  competitorHistory(history: number[]): void { this.information('Historial simulado: ' + history.map(value => this.money(value)).join(' → ')); }
  readonly money = demoMoney;
  stock(product: DemoProduct): number { return this.state.commerce.available(product.sku); }
  favorite(sku: string): boolean { return this.state.context() === DemoContext.Customer && this.state.actor.favorites.includes(sku); }
  get draftPrice(): number { return this.draftProduct.price / 100; }
  set draftPrice(value: number) { this.draftProduct.price = Math.round(Number(value) * 100); }
  clearFilters(): void { this.search.set(''); this.category.set(''); this.brand.set(''); this.maxPrice.set(null); this.stockScope.set(CatalogStockScope.All); this.sort.set(CatalogSort.Featured); this.page.set(0); void this.router.navigate(['/demo/catalog'], { replaceUrl: true }); }
  toggleFavorite(sku: string): void { if (this.state.context() !== DemoContext.Customer) { if (this.screen === DemoScreen.Product && this.product?.sku === sku) this.requestProductAccess(this.product, AccessSelectionPurpose.Favorite); else void this.router.navigate(['/demo/login'], { queryParams: this.continuation.route(this.router.url) }); return; } this.state.run(() => this.state.commerce.favorite(this.state.actorId(), sku), 'Favoritos actualizados.'); }
  selectVariant(raw: string): void { this.variant.set(DemoProductVariant.fromWire(raw)); }
  private restoreProductSelection(): void {
    if (this.screen !== DemoScreen.Product) return;
    const selected = DemoProductSelection.fromWire(this.route.snapshot.queryParamMap, this.variants, this.product ? this.stock(this.product) : 0);
    this.variant.set(selected.variant); this.quantity = selected.quantity;
  }
  add(product: DemoProduct): void {
    if (this.state.context() !== DemoContext.Customer) {
      this.requestProductAccess(product); return;
    }
    this.state.run(() => this.state.commerce.add(this.state.actorId(), product.sku, this.quantity, this.variant()), `${product.name} · ${this.variant().label} agregado a tu carrito.`);
  }
  private requestProductAccess(product: DemoProduct, purpose = AccessSelectionPurpose.Purchase): void {
    const criteria = this.catalogQueryParams;
    const captured = this.continuation.capture.execute(product, this.variant(), this.quantity, this.stock(product), { get: key => criteria[key] == null ? null : String(criteria[key]) }, purpose);
    if (captured.status !== PurchaseCaptureStatus.Ready) { this.state.error.set(captured.status.label); return; }
    this.state.error.set(''); void this.router.navigate(['/demo/login'], { queryParams: { returnUrl: captured.target.url } });
  }
  setQuantity(sku: string, raw: number | null): void { this.state.run(() => this.state.commerce.setQuantity(this.state.actorId(), sku, raw ?? Number.NaN), 'Carrito actualizado.'); }
  remove(sku: string): void { const removed = this.state.actor.cart.find(line => line.sku === sku) ?? null; if (this.state.run(() => this.state.commerce.remove(this.state.actorId(), sku), 'Producto quitado del carrito.')) this.removed = removed; }
  restore(): void { const removed = this.removed; if (removed && this.state.run(() => this.state.commerce.add(this.state.actorId(), removed.sku, removed.quantity, removed.variant), 'Producto restaurado.')) this.removed = null; }
  signIn(): void { if (!this.email.trim() || !this.password.trim()) { this.state.error.set('Completá email y contraseña de demostración.'); return; } this.chooseContext = true; }
  get authReturnQuery(): { returnUrl: string } | null { return this.continuation.query(this.route.snapshot.queryParamMap.get('returnUrl')); }
  get accessReturnQuery(): { returnUrl: string } | null { return this.continuation.route(this.router.url); }
  context(context: DemoContext, role = UserRole.Admin): void {
    const destination = this.continuation.resolve.execute(this.route.snapshot.queryParamMap.get('returnUrl'), DemoScreen.Login, context, role);
    const actor = this.state.data.actors.find(value => value.email.toLowerCase() === this.email.toLowerCase())?.id ?? 'cliente';
    const target = this.continuation.complete.execute(destination, () => this.state.login(context, actor, role));
    if (target !== null) void this.router.navigateByUrl(target);
  }
  register(): void {
    if (!this.profileName.trim() || !this.email.includes('@') || this.password.length < 4) { this.state.error.set('Completá nombre, email válido y contraseña de al menos 4 caracteres.'); return; }
    const destination = this.continuation.resolve.execute(this.route.snapshot.queryParamMap.get('returnUrl'), DemoScreen.Register, DemoContext.Customer, UserRole.Unknown);
    const id = `customer-${crypto.randomUUID()}`;
    if (!this.state.run(() => this.state.commerce.registerActor({ id, email: this.email, firstName: this.profileName, lastName: this.profileLastName, phone: '', addresses: [], cart: [], favorites: [] }), 'Cuenta demo creada.')) return;
    const target = this.continuation.complete.execute(destination, () => this.state.login(DemoContext.Customer, id));
    if (target !== null) void this.router.navigateByUrl(target);
  }
  nextStep(): void { const result = this.checkoutFlow.advance(this.step(), this.checkoutFacts); if (result.issue !== DemoCheckoutIssue.None) { this.showCheckoutIssue(result.issue); return; } this.state.error.set(''); this.checkoutStep(result.step); }
  checkout(): void {
    if (this.paymentPhase() === DemoPaymentPhase.Processing) return;
    const issue = this.checkoutFlow.validateSubmission(this.paymentMethod(), this.checkoutFacts);
    if (issue !== DemoCheckoutIssue.None) { if (issue === DemoCheckoutIssue.MissingAddress) this.step.set(CheckoutStep.Address); else if (issue === DemoCheckoutIssue.MissingDelivery) this.step.set(CheckoutStep.Delivery); this.showCheckoutIssue(issue); return; }
    try { this.state.validateCustomerSession(); } catch (error) { this.state.error.set(error instanceof Error ? error.message : 'Sesión no válida.'); return; }
    const epoch = this.state.sessionEpoch();
    const actorId = this.state.actorId(), addressId = this.addressId, scenario = this.state.scenario(), method = this.paymentMethod(), delivery = this.deliveryMethod();
    const acceptedQuote = this.deliveryQuote, acceptedCart = this.checkoutCartIdentity;
    this.paymentPhase.set(DemoPaymentPhase.Processing);
    this.paymentTimer = setTimeout(() => { if (epoch !== this.state.sessionEpoch() || this.state.context() !== DemoContext.Customer) return; if (!acceptedQuote.sameAs(this.deliveryQuote) || acceptedCart !== this.checkoutCartIdentity) this.deliveryAcceptance.reset(); const currentIssue = this.checkoutFlow.validateSubmission(method, this.checkoutFacts); if (currentIssue !== DemoCheckoutIssue.None) { this.paymentPhase.set(DemoPaymentPhase.Ready); this.step.set(currentIssue === DemoCheckoutIssue.MissingAddress ? CheckoutStep.Address : CheckoutStep.Delivery); this.showCheckoutIssue(currentIssue); return; } let id = ''; if (this.state.run(() => { id = this.state.commerce.checkout(actorId, this.request, addressId, scenario, method, delivery).id; }, 'Pedido registrado.')) void this.router.navigate(['/demo/checkout/result', id]); this.paymentPhase.set(DemoPaymentPhase.Ready); }, 750);
  }
  cancelProcessing(): void { clearTimeout(this.paymentTimer); this.paymentPhase.set(DemoPaymentPhase.Cancelled); }
  cancelPayment(): void { if (this.screen.admin && this.state.role() !== UserRole.Admin) return; const order = this.order; if (order) this.state.run(() => this.state.commerce.cancelPayment(order.id), 'Pago cancelado. Reserva de stock liberada.'); }
  saveIncident(): void { if (this.screen.admin && this.state.role() !== UserRole.Admin) return; const order = this.order; if (order && this.state.run(() => this.state.commerce.reportIncident(order.id, this.incidentReason), 'Incidencia registrada y visible en seguimiento.')) this.close(); }
  resolveIncident(): void { if (this.screen.admin && this.state.role() !== UserRole.Admin) return; const order = this.order; if (order) this.state.run(() => this.state.commerce.resolveIncident(order.id), 'Incidencia resuelta.'); }
  receiptText(): string { const order = this.order; if (!order) return ''; const delivery = order.delivery ? `Entrega ${order.delivery.method.label} · ${this.money(order.delivery.cost)}` : `Entrega ${order.fulfillment?.label ?? 'Modalidad no informada'} · Costo no informado`; return ['COMPROBANTE DEMO — NO FISCAL', order.id, `Pago ${order.payment.label} · ${order.method?.label ?? 'Medio de pago no informado'}`, order.address, ...order.lines.map(line => `${line.name} × ${line.quantity} · ${this.money(line.unit * line.quantity)}`), delivery, `TOTAL ${this.money(order.total)}`, 'Sin cobro real ni validez fiscal.'].join('\n'); }
  downloadReceipt(): void { const url = URL.createObjectURL(new Blob([this.receiptText()], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `comprobante-demo-${this.order?.id}.txt`; anchor.click(); URL.revokeObjectURL(url); }
  printReceipt(): void { window.print(); }
  resolvePayment(): void { if (this.screen.admin && this.state.role() !== UserRole.Admin) return; const order = this.order; if (order) this.state.run(() => this.state.commerce.resolvePayment(order.id, this.state.scenario()), 'Pago simulado actualizado.'); }
  retryOrder(): void { const order = this.order; if (!order || (order.payment !== PaymentStatus.Rejected && order.payment !== PaymentStatus.Cancelled)) return; if (this.state.run(() => { for (const line of order.lines) this.state.commerce.add(this.state.actorId(), line.sku, line.quantity, line.variant); }, 'Productos recuperados en tu carrito.')) void this.router.navigate(['/demo/cart']); }
  open(dialog: DemoDialog): void { this.focusBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : null; this.dialog.set(dialog); setTimeout(() => document.querySelector<HTMLDialogElement>('dialog')?.showModal()); }
  close(): void { document.querySelector<HTMLDialogElement>('dialog')?.close(); this.dialog.set(DemoDialog.None); this.focusBeforeDialog?.focus(); }
  information(text: string): void { this.info = text; this.open(DemoDialog.Information); }
  confirm(text: string, action: () => void): void { this.info = text; this.confirmationEpoch = this.state.sessionEpoch(); this.confirmation = action; this.open(DemoDialog.Confirm); }
  performConfirmation(): void { const action = this.confirmationEpoch === this.state.sessionEpoch() ? this.confirmation : null; this.confirmation = null; this.close(); action?.(); }
  editingSku: string | undefined;
  editProduct(product?: DemoProduct): void { this.editingSku = product?.sku; this.draftProduct = product ? { ...product } : { ...this.draftProduct, sku: `DEMO-${this.state.data.products.length + 1}`, name: '', reserved: 0, supportsCase: false }; this.open(DemoDialog.Product); }
  saveProduct(): void { if (this.state.run(() => this.state.commerce.saveProduct({ ...this.draftProduct }, this.editingSku), `Producto ${this.draftProduct.sku} guardado.`)) this.close(); }
  archive(product: DemoProduct): void { this.state.run(() => this.state.commerce.saveProduct({ ...product, active: !product.active }, product.sku), product.active ? 'Producto archivado; ya no aparece en tienda.' : 'Producto publicado en tienda.'); }
  editAddress(address?: DemoAddress): void { this.draftAddress = address ? { ...address } : { id: crypto.randomUUID(), label: 'Casa', street: '', city: '', postal: '', primary: false }; this.open(DemoDialog.Address); }
  saveAddress(): void { if (!this.draftAddress.street.trim() || !this.draftAddress.city.trim() || !this.draftAddress.postal.trim()) { this.state.error.set('Completá calle, ciudad y código postal.'); return; } if (this.state.run(() => { const actor = this.state.actor; const index = actor.addresses.findIndex(value => value.id === this.draftAddress.id); if (this.draftAddress.primary) actor.addresses.forEach(value => value.primary = false); if (index < 0) actor.addresses.push({ ...this.draftAddress, primary: actor.addresses.length === 0 || this.draftAddress.primary }); else actor.addresses[index] = { ...this.draftAddress }; this.state.commerce.touch(); }, 'Dirección guardada.')) { this.close(); if (this.screen === DemoScreen.Checkout) { this.selectCheckoutAddress(this.draftAddress.id); this.focusCheckout('checkout-addresses'); } } }
  deleteAddress(address: DemoAddress): void { this.state.run(() => { this.state.actor.addresses = this.state.actor.addresses.filter(value => value.id !== address.id); if (address.primary && this.state.actor.addresses[0]) this.state.actor.addresses[0].primary = true; this.state.commerce.touch(); }, 'Dirección eliminada.'); }
  primary(address: DemoAddress): void { this.state.run(() => { this.state.actor.addresses.forEach(value => value.primary = value.id === address.id); this.state.commerce.touch(); }, 'Dirección principal actualizada.'); }
  saveProfile(): void { if (!this.profileName.trim()) { this.state.error.set('Ingresá tu nombre.'); return; } this.state.run(() => { Object.assign(this.state.actor, { firstName: this.profileName, lastName: this.profileLastName, phone: this.profilePhone }); this.state.commerce.touch(); }, 'Perfil actualizado.'); }
  cancelProfile(): void { this.profileName = this.state.actor.firstName; this.profileLastName = this.state.actor.lastName; this.profilePhone = this.state.actor.phone; }
  editCampaign(campaign?: DemoCampaign): void { this.draftCampaign = campaign ? { ...campaign } : { ...this.draftCampaign, id: crypto.randomUUID(), title: '', sku: this.state.data.products[0].sku }; this.open(DemoDialog.Campaign); }
  saveCampaign(): void { if (this.state.run(() => this.state.commerce.saveCampaign(this.draftCampaign), 'Oferta guardada; el precio efectivo se actualiza en tienda.')) this.close(); }
  toggleCampaign(campaign: DemoCampaign): void { this.state.run(() => this.state.commerce.saveCampaign({ ...campaign, active: !campaign.active }), 'Vigencia de la oferta actualizada.'); }
  adjust(product: DemoProduct): void { this.adjustmentSku = product.sku; this.adjustmentDelta = 1; this.adjustmentReason = ''; this.open(DemoDialog.Adjustment); }
  saveAdjustment(): void { if (this.state.run(() => this.state.commerce.adjust(this.adjustmentSku, Number(this.adjustmentDelta), this.adjustmentReason), 'Movimiento de inventario registrado.')) this.close(); }
  advance(): void { if (this.state.role() !== UserRole.Admin) return; const order = this.order; if (order) this.state.run(() => this.state.commerce.advance(order.id), 'Estado de entrega actualizado.'); }
  receiveReturn(): void { if (this.state.role() !== UserRole.Admin) return; const order = this.order; if (order) this.state.run(() => this.state.commerce.receiveReturn(order.id), 'Devolución recibida para inspección.'); }
  connectML(): void { this.state.run(() => { this.state.data.mlConnected = !this.state.data.mlConnected; this.state.commerce.touch(); }, this.state.data.mlConnected ? 'Cuenta simulada desconectada.' : 'Cuenta simulada conectada.'); }
  linkML(sku: string): void { this.state.run(() => { const listing = this.state.data.listings.find(value => value.sku === sku); if (listing) { listing.linked = !listing.linked; if (listing.linked) listing.desired = undefined; } else this.state.data.listings.push({ sku, linked: true, observed: 0, error: false }); this.state.commerce.touch(); }, 'Vínculo simulado actualizado.'); }
  syncML(sku: string): void { this.state.run(() => { if (!this.state.data.mlConnected) throw new Error('Conectá la cuenta simulada primero.'); const listing = this.state.data.listings.find(value => value.sku === sku); if (!listing?.linked) throw new Error('Vinculá el producto primero.'); listing.error = this.state.scenario() === DemoScenario.Error; if (!listing.error) listing.observed = this.state.commerce.available(sku); this.state.commerce.touch(); }, 'Sincronización simulada registrada.'); }
  saleML(sku: string): void { this.state.run(() => this.state.commerce.mlSale(sku, `ml-sale-${sku}`), 'Venta simulada registrada (repetir la misma operación no duplica stock).'); }
  simulateCompetitor(competitor = this.state.data.competitors[0]): void { if (competitor) this.state.run(() => this.state.commerce.competitorPrice(competitor.id, Math.max(100, competitor.price - Math.max(10000, Math.round(competitor.price * .1)))), 'Precio de muestra actualizado; revisá el historial y las alertas.'); }
  watchCompetitor(): void { if (this.state.run(() => this.state.commerce.watchCompetitor(this.competitorName, this.competitorSku, Number(this.competitorThreshold)), 'Competidor agregado a seguimiento simulado.')) this.competitorName = ''; }
  toggleCompetitor(competitor: DemoCompetitor): void { this.state.run(() => { competitor.enabled = competitor.enabled === false; this.state.commerce.touch(); }, 'Preferencia de alertas actualizada.'); }
  removeCompetitor(competitor: DemoCompetitor): void { this.state.run(() => { this.state.data.competitors = this.state.data.competitors.filter(value => value.id !== competitor.id); this.state.commerce.touch(); }, 'Competidor eliminado del seguimiento.'); }
  processStock(): void { this.state.run(() => this.state.commerce.processStock(this.state.scenario() === DemoScenario.Error), 'Cola de sincronización simulada procesada.'); }
  acknowledge(): void { this.state.run(() => { this.state.data.competitors.forEach(value => value.unread = false); this.state.commerce.touch(); }, 'Alertas marcadas como leídas.'); }
  moduleToggle(id: DemoModuleId): void { this.confirm(`Cambiar el estado de ${id.label} afecta sus operaciones simuladas.`, () => this.state.run(() => { const module = this.state.data.modules.find(value => value.id === id); if (!module || id === DemoModuleId.Unknown) throw new Error('Módulo desconocido.'); module.enabled = !module.enabled; this.state.commerce.touch(); }, 'Estado del módulo demo guardado.')); }
  configureModule(id: DemoModuleId): void { this.draftModule = id; this.draftSettings = { ...this.state.data.settings }; this.open(DemoDialog.Module); }
  saveModule(): void { if (this.draftModule === DemoModuleId.Unknown) { this.state.error.set('Módulo no reconocido.'); return; } if (this.state.run(() => this.state.commerce.saveSettings(this.draftSettings), `${this.draftModule.label}: configuración guardada.`)) this.close(); }
  validateManifest(): void { try { const parsed: unknown = JSON.parse(this.manifest); if (!parsed || typeof parsed !== 'object' || !('title' in parsed) || typeof parsed.title !== 'string') throw new Error('El perfil requiere un título de comercio.'); this.information(`Perfil válido. Nuevo título: ${parsed.title}. La importación actualiza solamente el contenido de esta demo.`); } catch { this.state.error.set('El perfil no es JSON válido o le falta title.'); } }
  importManifest(): void { this.state.run(() => { const parsed: unknown = JSON.parse(this.manifest); if (!parsed || typeof parsed !== 'object' || !('title' in parsed) || typeof parsed.title !== 'string' || !parsed.title.trim()) throw new Error('Perfil inválido.'); this.state.data.title = parsed.title; this.state.commerce.touch(); }, 'Perfil importado en la demo.'); }
  exportProfile(): void { const blob = new Blob([JSON.stringify({ version: 1, title: this.state.data.title, subtitle: this.state.data.subtitle }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'comercio-demo.json'; anchor.click(); URL.revokeObjectURL(url); }
}
