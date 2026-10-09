import { Component, computed, inject, signal, DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DemoApplicationState } from './demo-state';
import { CheckoutStep, DemoAddress, DemoCampaign, DemoContext, DemoProduct, DemoScenario, DemoGalleryView, DemoProductVariant, DemoModuleId, DemoContentBlock, DemoSettings } from './demo-model';
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
  static readonly Unknown = new DemoDialog('Acción desconocida');
  static fromWire(raw: unknown): DemoDialog { return [this.None, this.Reset, this.Product, this.Address, this.Campaign, this.Adjustment, this.Information, this.Confirm, this.Module, this.Tracking, this.Receipt, this.Incident].find(value => value.label === raw) ?? this.Unknown; }
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

@Component({ selector: 'sc-demo-page', imports: [FormsModule, RouterLink], templateUrl: './demo-page.html', styleUrl: './demo.scss' })
export class DemoPageComponent {
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
  readonly Gallery = DemoGalleryView;
  readonly gallery = signal(DemoGalleryView.Front);
  get variants(): readonly DemoProductVariant[] { return this.product?.supportsCase === false ? [DemoProductVariant.Standard] : DemoProductVariant.all; }
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
  readonly onlyAvailable = signal(false);
  readonly maxPrice = signal(0);
  readonly sort = signal(CatalogSort.Featured);
  readonly categories = computed(() => [...new Set(this.state.data.products.map(product => product.category))]);
  readonly brands = computed(() => [...new Set(this.state.data.products.map(product => product.brand))]);
  readonly filtered = computed(() => this.state.data.products.filter(product => product.active && (!this.search() || `${product.name} ${product.sku}`.toLowerCase().includes(this.search().toLowerCase())) && (!this.category() || product.category === this.category()) && (!this.brand() || product.brand === this.brand()) && (!this.onlyAvailable() || this.state.commerce.available(product.sku) > 0) && (!this.maxPrice() || this.state.commerce.price(product.sku) <= this.maxPrice() * 100)).sort(this.sort().compare));
  readonly products = computed(() => this.filtered().slice(this.page() * 6, this.page() * 6 + 6));
  private request = crypto.randomUUID();
  private focusBeforeDialog: HTMLElement | null = null;
  private confirmation: (() => void) | null = null;
  email = 'cliente@demo.invalid';
  password = '';
  showPassword = false;
  chooseContext = false;
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
  adjustmentDelta = 1;
  adjustmentReason = '';
  selectedOrderStatus: PaymentStatus | null = null;
  draftProduct: DemoProduct = { sku: '', name: '', category: 'Herramientas', brand: 'Norte', description: '', price: 10000, original: 10000, onHand: 1, reserved: 0, active: true, tone: '#e6a63f', variant: 'Estándar' };
  draftAddress: DemoAddress = { id: '', label: 'Casa', street: '', city: '', postal: '', primary: false };
  draftCampaign: DemoCampaign = { id: '', title: '', sku: '', percent: 10, active: true, from: '2026-10-08', until: '2027-12-31' };
  configName = 'Mi comercio';
  manifest = '';
  removed: { sku: string; quantity: number; variant: DemoProductVariant } | null = null;
  constructor() { inject(DestroyRef).onDestroy(() => clearTimeout(this.paymentTimer)); this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => { this.search.set(params.get('q') ?? ''); this.category.set(params.get('category') ?? ''); this.page.set(0); }); }
  get relatedProducts(): DemoProduct[] { return this.state.data.products.filter(value => value.active && value.sku !== this.product?.sku && value.category === this.product?.category).slice(0,4); }
  productImage(product: DemoProduct): string { return `/assets/demo/${/^DEMO-0(0[1-9]|1[0-2])$/.test(product.sku) ? product.sku : 'DEMO-010'}.svg`; }
  get checkoutTotal(): number { return this.total + this.deliveryMethod().cost; }
  selectPayment(raw: string): void { this.paymentMethod.set(DemoPaymentMethod.fromWire(raw)); }
  selectDelivery(raw: string): void { this.deliveryMethod.set(DemoDeliveryMethod.fromWire(raw)); this.delivery = this.deliveryMethod() !== DemoDeliveryMethod.Unknown; }
  selectMLTab(tab: DemoMLTab): void { this.mlTab.set(tab); }
  mlKeyboard(event: KeyboardEvent): void { const index = DemoMLTab.all.indexOf(this.mlTab()); const next = event.key === 'ArrowRight' ? (index + 1) % DemoMLTab.all.length : event.key === 'ArrowLeft' ? (index + DemoMLTab.all.length - 1) % DemoMLTab.all.length : event.key === 'Home' ? 0 : event.key === 'End' ? DemoMLTab.all.length - 1 : -1; if (next < 0) return; event.preventDefault(); const tab = DemoMLTab.all[next]; this.mlTab.set(tab); setTimeout(() => document.getElementById(`ml-tab-${tab.wire}`)?.focus()); }
  get screen(): DemoScreen { return DemoScreen.fromWire(this.route.snapshot.data['screen']); }
  get allowed(): boolean { return this.screen.admin ? this.state.context() === DemoContext.Admin : !this.screen.privateCustomer || this.state.context() === DemoContext.Customer; }
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
  changeSort(raw: string): void { this.sort.set(CatalogSort.fromWire(raw)); this.page.set(0); }
  movements(product: DemoProduct): void { const rows = this.state.data.movements.filter(value => value.sku === product.sku); this.information(rows.length ? rows.map(value => `${value.delta > 0 ? '+' : ''}${value.delta} unidades · ${value.reason}`).join('\n') : 'Sin movimientos posteriores al stock inicial de demostración.'); }
  competitorHistory(history: number[]): void { this.information('Historial simulado: ' + history.map(value => this.money(value)).join(' → ')); }
  money(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value / 100); }
  stock(product: DemoProduct): number { return this.state.commerce.available(product.sku); }
  favorite(sku: string): boolean { return this.state.context() === DemoContext.Customer && this.state.actor.favorites.includes(sku); }
  get draftPrice(): number { return this.draftProduct.price / 100; }
  set draftPrice(value: number) { this.draftProduct.price = Math.round(Number(value) * 100); }
  clearFilters(): void { this.search.set(''); this.category.set(''); this.brand.set(''); this.maxPrice.set(0); this.onlyAvailable.set(false); this.page.set(0); }
  toggleFavorite(sku: string): void { if (this.state.context() !== DemoContext.Customer) { void this.router.navigate(['/demo/login']); return; } this.state.run(() => this.state.commerce.favorite(this.state.actorId(), sku), 'Favoritos actualizados.'); }
  selectVariant(raw: string): void { this.variant.set(DemoProductVariant.fromWire(raw)); }
  add(product: DemoProduct): void { if (this.state.context() !== DemoContext.Customer) { void this.router.navigate(['/demo/login']); return; } this.state.run(() => this.state.commerce.add(this.state.actorId(), product.sku, this.quantity, this.variant()), `${product.name} · ${this.variant().label} agregado a tu carrito.`); }
  setQuantity(sku: string, raw: number): void { this.state.run(() => this.state.commerce.setQuantity(this.state.actorId(), sku, Number(raw)), 'Carrito actualizado.'); }
  remove(sku: string): void { this.removed = this.state.actor.cart.find(line => line.sku === sku) ?? null; this.setQuantity(sku, 0); }
  restore(): void { const removed = this.removed; if (removed && this.state.run(() => this.state.commerce.add(this.state.actorId(), removed.sku, removed.quantity, removed.variant), 'Producto restaurado.')) this.removed = null; }
  signIn(): void { if (!this.email.trim() || !this.password.trim()) { this.state.error.set('Completá email y contraseña de demostración.'); return; } this.chooseContext = true; }
  context(context: DemoContext): void { const actor = this.state.data.actors.find(value => value.email.toLowerCase() === this.email.toLowerCase())?.id ?? 'cliente'; this.state.login(context, actor); void this.router.navigate([context === DemoContext.Admin ? '/demo/user/home' : '/demo']); }
  register(): void { if (!this.profileName.trim() || !this.email.includes('@') || this.password.length < 4) { this.state.error.set('Completá nombre, email válido y contraseña de al menos 4 caracteres.'); return; } const id = `customer-${crypto.randomUUID()}`; if (this.state.run(() => { this.state.data.actors.push({ id, email: this.email, firstName: this.profileName, lastName: this.profileLastName, phone: '', addresses: [], cart: [], favorites: [] }); this.state.commerce.touch(); }, 'Cuenta demo creada.')) { this.state.login(DemoContext.Customer, id); void this.router.navigate(['/demo/customer/profile']); } }
  nextStep(): void { if (this.step() === CheckoutStep.Address && this.deliveryMethod() !== DemoDeliveryMethod.Pickup && !this.state.actor.addresses.some(address => address.id === this.addressId)) { this.state.error.set('Seleccioná una dirección o retiro en el comercio.'); return; } if (this.step() === CheckoutStep.Delivery && (!this.delivery || this.deliveryMethod() === DemoDeliveryMethod.Unknown || (this.deliveryMethod() === DemoDeliveryMethod.Home && !this.state.actor.addresses.some(address => address.id === this.addressId)))) { this.state.error.set('Confirmá la entrega; domicilio requiere una dirección válida.'); return; } this.state.error.set(''); this.step.set(this.step().next()); }
  checkout(): void {
    if (this.paymentPhase() === DemoPaymentPhase.Processing) return;
    if (this.paymentMethod() === DemoPaymentMethod.Unknown || this.deliveryMethod() === DemoDeliveryMethod.Unknown) { this.state.error.set('Seleccioná pago y entrega.'); return; }
    const actorId = this.state.actorId(), addressId = this.addressId, scenario = this.state.scenario(), method = this.paymentMethod(), delivery = this.deliveryMethod();
    this.paymentPhase.set(DemoPaymentPhase.Processing);
    this.paymentTimer = setTimeout(() => { let id = ''; if (this.state.run(() => { id = this.state.commerce.checkout(actorId, this.request, addressId, scenario, method, delivery).id; }, 'Pedido registrado.')) void this.router.navigate(['/demo/checkout/result', id]); this.paymentPhase.set(DemoPaymentPhase.Ready); }, 750);
  }
  cancelProcessing(): void { clearTimeout(this.paymentTimer); this.paymentPhase.set(DemoPaymentPhase.Cancelled); }
  cancelPayment(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.cancelPayment(order.id), 'Pago cancelado. Reserva de stock liberada.'); }
  saveIncident(): void { const order = this.order; if (order && this.state.run(() => this.state.commerce.reportIncident(order.id, this.incidentReason), 'Incidencia registrada y visible en seguimiento.')) this.close(); }
  resolveIncident(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.resolveIncident(order.id), 'Incidencia resuelta.'); }
  receiptText(): string { const order = this.order; if (!order) return ''; return ['COMPROBANTE DEMO — NO FISCAL', order.id, `Pago ${order.payment.label} · ${order.method?.label ?? DemoPaymentMethod.Card.label}`, order.address, ...order.lines.map(line => `${line.name} × ${line.quantity} · ${this.money(line.unit * line.quantity)}`), `Entrega ${this.money(order.delivery?.cost ?? 0)}`, `TOTAL ${this.money(order.total)}`, 'Sin cobro real ni validez fiscal.'].join('\n'); }
  downloadReceipt(): void { const url = URL.createObjectURL(new Blob([this.receiptText()], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `comprobante-demo-${this.order?.id}.txt`; anchor.click(); URL.revokeObjectURL(url); }
  printReceipt(): void { window.print(); }
  resolvePayment(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.resolvePayment(order.id, this.state.scenario()), 'Pago simulado actualizado.'); }
  retryOrder(): void { const order = this.order; if (!order || (order.payment !== PaymentStatus.Rejected && order.payment !== PaymentStatus.Cancelled)) return; if (this.state.run(() => { for (const line of order.lines) this.state.commerce.add(this.state.actorId(), line.sku, line.quantity, line.variant); }, 'Productos recuperados en tu carrito.')) void this.router.navigate(['/demo/cart']); }
  open(dialog: DemoDialog): void { this.focusBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : null; this.dialog.set(dialog); setTimeout(() => document.querySelector<HTMLDialogElement>('dialog')?.showModal()); }
  close(): void { document.querySelector<HTMLDialogElement>('dialog')?.close(); this.dialog.set(DemoDialog.None); this.focusBeforeDialog?.focus(); }
  information(text: string): void { this.info = text; this.open(DemoDialog.Information); }
  confirm(text: string, action: () => void): void { this.info = text; this.confirmation = action; this.open(DemoDialog.Confirm); }
  performConfirmation(): void { const action = this.confirmation; this.confirmation = null; this.close(); action?.(); }
  editingSku: string | undefined;
  editProduct(product?: DemoProduct): void { this.editingSku = product?.sku; this.draftProduct = product ? { ...product } : { ...this.draftProduct, sku: `DEMO-${this.state.data.products.length + 1}`, name: '', reserved: 0 }; this.open(DemoDialog.Product); }
  saveProduct(): void { if (this.state.run(() => this.state.commerce.saveProduct({ ...this.draftProduct }, this.editingSku), `Producto ${this.draftProduct.sku} guardado.`)) this.close(); }
  archive(product: DemoProduct): void { this.state.run(() => this.state.commerce.saveProduct({ ...product, active: !product.active }, product.sku), product.active ? 'Producto archivado; ya no aparece en tienda.' : 'Producto publicado en tienda.'); }
  editAddress(address?: DemoAddress): void { this.draftAddress = address ? { ...address } : { id: crypto.randomUUID(), label: 'Casa', street: '', city: '', postal: '', primary: false }; this.open(DemoDialog.Address); }
  saveAddress(): void { if (!this.draftAddress.street.trim() || !this.draftAddress.city.trim() || !this.draftAddress.postal.trim()) { this.state.error.set('Completá calle, ciudad y código postal.'); return; } if (this.state.run(() => { const actor = this.state.actor; const index = actor.addresses.findIndex(value => value.id === this.draftAddress.id); if (this.draftAddress.primary) actor.addresses.forEach(value => value.primary = false); if (index < 0) actor.addresses.push({ ...this.draftAddress, primary: actor.addresses.length === 0 || this.draftAddress.primary }); else actor.addresses[index] = { ...this.draftAddress }; this.state.commerce.touch(); }, 'Dirección guardada.')) this.close(); }
  deleteAddress(address: DemoAddress): void { this.state.run(() => { this.state.actor.addresses = this.state.actor.addresses.filter(value => value.id !== address.id); if (address.primary && this.state.actor.addresses[0]) this.state.actor.addresses[0].primary = true; this.state.commerce.touch(); }, 'Dirección eliminada.'); }
  primary(address: DemoAddress): void { this.state.run(() => { this.state.actor.addresses.forEach(value => value.primary = value.id === address.id); this.state.commerce.touch(); }, 'Dirección principal actualizada.'); }
  saveProfile(): void { if (!this.profileName.trim()) { this.state.error.set('Ingresá tu nombre.'); return; } this.state.run(() => { Object.assign(this.state.actor, { firstName: this.profileName, lastName: this.profileLastName, phone: this.profilePhone }); this.state.commerce.touch(); }, 'Perfil actualizado.'); }
  cancelProfile(): void { this.profileName = this.state.actor.firstName; this.profileLastName = this.state.actor.lastName; this.profilePhone = this.state.actor.phone; }
  saveContent(): void { if (!this.contentTitle.trim() || this.contentBlocks.some(block => !block.title.trim() || !block.body.trim())) { this.state.error.set('Completá el título de portada y el contenido de cada bloque.'); return; } this.state.run(() => { this.state.data.title = this.contentTitle; this.state.data.subtitle = this.contentSubtitle; this.state.data.blocks = this.contentBlocks.map(block => ({ ...block })); this.state.commerce.touch(); }, 'Contenido publicado en la tienda.'); }
  cancelContent(): void { this.contentTitle = this.state.data.title; this.contentSubtitle = this.state.data.subtitle; this.contentBlocks = this.state.data.blocks.map(block => ({ ...block })); }
  reorderContent(index: number, direction: number): void { const target = index + direction; if (target < 0 || target >= this.contentBlocks.length) return; const blocks = [...this.contentBlocks]; [blocks[index], blocks[target]] = [blocks[target], blocks[index]]; this.contentBlocks = blocks; }
  editCampaign(campaign?: DemoCampaign): void { this.draftCampaign = campaign ? { ...campaign } : { ...this.draftCampaign, id: crypto.randomUUID(), title: '', sku: this.state.data.products[0].sku }; this.open(DemoDialog.Campaign); }
  saveCampaign(): void { if (this.state.run(() => this.state.commerce.saveCampaign(this.draftCampaign), 'Oferta guardada; el precio efectivo se actualiza en tienda.')) this.close(); }
  toggleCampaign(campaign: DemoCampaign): void { this.state.run(() => this.state.commerce.saveCampaign({ ...campaign, active: !campaign.active }), 'Vigencia de la oferta actualizada.'); }
  adjust(product: DemoProduct): void { this.adjustmentSku = product.sku; this.adjustmentDelta = 1; this.adjustmentReason = ''; this.open(DemoDialog.Adjustment); }
  saveAdjustment(): void { if (this.state.run(() => this.state.commerce.adjust(this.adjustmentSku, Number(this.adjustmentDelta), this.adjustmentReason), 'Movimiento de inventario registrado.')) this.close(); }
  advance(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.advance(order.id), 'Estado de entrega actualizado.'); }
  receiveReturn(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.receiveReturn(order.id), 'Devolución recibida para inspección.'); }
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
