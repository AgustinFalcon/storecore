import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DemoApplicationState } from './demo-state';
import { CheckoutStep, DemoAddress, DemoCampaign, DemoContext, DemoProduct, DemoScenario } from './demo-model';
import { DemoScreen } from './demo-screen';
import { PaymentStatus } from '../domain/order/payment-status';
import { ShipmentStatus } from '../domain/order/shipment-status';

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
  static readonly Unknown = new DemoDialog('Acción desconocida');
  static fromWire(raw: unknown): DemoDialog { return [this.None, this.Reset, this.Product, this.Address, this.Campaign, this.Adjustment, this.Information, this.Confirm].find(value => value.label === raw) ?? this.Unknown; }
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

@Component({ selector: 'sc-root', imports: [RouterOutlet, RouterLink, FormsModule], templateUrl: './demo-shell.html', styleUrl: './demo.scss' })
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
  readonly sorts = CatalogSort.all;
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
  removed: { sku: string; quantity: number } | null = null;
  constructor() { this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => { this.search.set(params.get('q') ?? ''); this.category.set(params.get('category') ?? ''); this.page.set(0); }); }
  get screen(): DemoScreen { return DemoScreen.fromWire(this.route.snapshot.data['screen']); }
  get allowed(): boolean { return this.screen.admin ? this.state.context() === DemoContext.Admin : !this.screen.privateCustomer || this.state.context() === DemoContext.Customer; }
  get product(): DemoProduct | undefined { this.state.revision(); return this.state.data.products.find(product => product.sku === this.route.snapshot.paramMap.get('sku')); }
  get order() { const order = this.state.data.orders.find(order => order.id === (this.route.snapshot.paramMap.get('id') ?? this.route.snapshot.paramMap.get('orderId'))); return this.screen.admin || order?.actor === this.state.actorId() ? order : undefined; }
  get orders() { return this.state.data.orders.filter(order => (this.screen.admin || order.actor === this.state.actorId()) && (!this.selectedOrderStatus || order.payment === this.selectedOrderStatus) && (!this.search() || order.id.toLowerCase().includes(this.search().toLowerCase()))); }
  get cartLines() { return this.state.actor.cart.map(line => ({ ...line, product: this.state.commerce.product(line.sku), unit: this.state.commerce.price(line.sku) })); }
  get total(): number { return this.cartLines.reduce((sum, line) => sum + line.unit * line.quantity, 0); }
  get revenue(): number { return this.state.data.orders.filter(order => order.payment === PaymentStatus.Approved).reduce((sum, order) => sum + order.total, 0); }
  get lowStock(): DemoProduct[] { return this.state.data.products.filter(product => this.state.commerce.available(product.sku) < 5); }
  get favoriteProducts(): DemoProduct[] { return this.state.data.products.filter(product => this.favorite(product.sku)); }
  get adminProducts(): DemoProduct[] { return this.state.data.products.filter(product => !this.search() || `${product.name} ${product.sku}`.toLowerCase().includes(this.search().toLowerCase())); }
  listing(sku: string) { return this.state.data.listings.find(value => value.sku === sku); }
  filterOrders(raw: string): void { this.selectedOrderStatus = raw ? PaymentStatus.fromWire(raw) : null; }
  changeSort(raw: string): void { this.sort.set(CatalogSort.fromWire(raw)); this.page.set(0); }
  movements(product: DemoProduct): void { const rows = this.state.data.movements.filter(value => value.sku === product.sku); this.information(rows.length ? rows.map(value => `${value.delta > 0 ? '+' : ''}${value.delta} unidades · ${value.reason}`).join('\n') : 'Sin movimientos posteriores al stock inicial de demostración.'); }
  competitorHistory(history: number[]): void { this.information('Historial simulado: ' + history.map(value => this.money(value)).join(' → ')); }
  money(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value / 100); }
  stock(product: DemoProduct): number { return this.state.commerce.available(product.sku); }
  favorite(sku: string): boolean { return this.state.context() === DemoContext.Customer && this.state.actor.favorites.includes(sku); }
  get draftPrice(): number { return this.draftProduct.price / 100; }
  set draftPrice(value: number) { this.draftProduct.price = Math.round(Number(value) * 100); }
  clearFilters(): void { this.search.set(''); this.category.set(''); this.brand.set(''); this.maxPrice.set(0); this.onlyAvailable.set(false); this.page.set(0); }
  toggleFavorite(sku: string): void { if (this.state.context() !== DemoContext.Customer) { void this.router.navigate(['/demo/login']); return; } this.state.run(() => this.state.commerce.favorite(this.state.actorId(), sku), 'Favoritos actualizados.'); }
  add(product: DemoProduct): void { if (this.state.context() !== DemoContext.Customer) { void this.router.navigate(['/demo/login']); return; } this.state.run(() => this.state.commerce.add(this.state.actorId(), product.sku, this.quantity), `${product.name} agregado a tu carrito.`); }
  setQuantity(sku: string, raw: number): void { this.state.run(() => this.state.commerce.setQuantity(this.state.actorId(), sku, Number(raw)), 'Carrito actualizado.'); }
  remove(sku: string): void { this.removed = this.state.actor.cart.find(line => line.sku === sku) ?? null; this.setQuantity(sku, 0); }
  restore(): void { const removed = this.removed; if (removed && this.state.run(() => this.state.commerce.add(this.state.actorId(), removed.sku, removed.quantity), 'Producto restaurado.')) this.removed = null; }
  signIn(): void { if (!this.email.trim() || !this.password.trim()) { this.state.error.set('Completá email y contraseña de demostración.'); return; } this.chooseContext = true; }
  context(context: DemoContext): void { this.state.login(context, this.email.includes('cliente2') ? 'cliente2' : 'cliente'); void this.router.navigate([context === DemoContext.Admin ? '/demo/user/home' : '/demo']); }
  register(): void { if (!this.profileName.trim() || !this.email.includes('@') || this.password.length < 4) { this.state.error.set('Completá nombre, email válido y contraseña de al menos 4 caracteres.'); return; } const id = `customer-${crypto.randomUUID()}`; if (this.state.run(() => { this.state.data.actors.push({ id, email: this.email, firstName: this.profileName, lastName: this.profileLastName, phone: '', addresses: [], cart: [], favorites: [] }); this.state.commerce.touch(); }, 'Cuenta demo creada.')) { this.state.login(DemoContext.Customer, id); void this.router.navigate(['/demo/customer/profile']); } }
  nextStep(): void { if (this.step() === CheckoutStep.Address && !this.state.actor.addresses.some(address => address.id === this.addressId)) { this.state.error.set('Seleccioná una dirección.'); return; } if (this.step() === CheckoutStep.Delivery && !this.delivery) { this.state.error.set('Seleccioná la entrega simulada.'); return; } this.state.error.set(''); this.step.set(this.step().next()); }
  checkout(): void { let id = ''; if (this.state.run(() => { id = this.state.commerce.checkout(this.state.actorId(), this.request, this.addressId, this.state.scenario()).id; }, 'Pedido registrado.')) { void this.router.navigate(['/demo/checkout/result', id]); } }
  resolvePayment(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.resolvePayment(order.id, this.state.scenario()), 'Pago simulado actualizado.'); }
  open(dialog: DemoDialog): void { this.focusBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : null; this.dialog.set(dialog); setTimeout(() => document.querySelector<HTMLDialogElement>('dialog')?.showModal()); }
  close(): void { document.querySelector<HTMLDialogElement>('dialog')?.close(); this.dialog.set(DemoDialog.None); this.focusBeforeDialog?.focus(); }
  information(text: string): void { this.info = text; this.open(DemoDialog.Information); }
  confirm(text: string, action: () => void): void { this.info = text; this.confirmation = action; this.open(DemoDialog.Confirm); }
  performConfirmation(): void { const action = this.confirmation; this.confirmation = null; this.close(); action?.(); }
  editProduct(product?: DemoProduct): void { this.draftProduct = product ? { ...product } : { ...this.draftProduct, sku: `DEMO-${this.state.data.products.length + 1}`, name: '', reserved: 0 }; this.open(DemoDialog.Product); }
  saveProduct(): void { if (this.state.run(() => this.state.commerce.saveProduct({ ...this.draftProduct }), `Producto ${this.draftProduct.sku} guardado.`)) this.close(); }
  archive(product: DemoProduct): void { this.state.run(() => this.state.commerce.saveProduct({ ...product, active: !product.active }), product.active ? 'Producto archivado; ya no aparece en tienda.' : 'Producto publicado en tienda.'); }
  editAddress(address?: DemoAddress): void { this.draftAddress = address ? { ...address } : { id: crypto.randomUUID(), label: 'Casa', street: '', city: '', postal: '', primary: false }; this.open(DemoDialog.Address); }
  saveAddress(): void { if (!this.draftAddress.street.trim() || !this.draftAddress.city.trim() || !this.draftAddress.postal.trim()) { this.state.error.set('Completá calle, ciudad y código postal.'); return; } if (this.state.run(() => { const actor = this.state.actor; const index = actor.addresses.findIndex(value => value.id === this.draftAddress.id); if (this.draftAddress.primary) actor.addresses.forEach(value => value.primary = false); if (index < 0) actor.addresses.push({ ...this.draftAddress, primary: actor.addresses.length === 0 || this.draftAddress.primary }); else actor.addresses[index] = { ...this.draftAddress }; this.state.commerce.touch(); }, 'Dirección guardada.')) this.close(); }
  deleteAddress(address: DemoAddress): void { this.state.run(() => { this.state.actor.addresses = this.state.actor.addresses.filter(value => value.id !== address.id); if (address.primary && this.state.actor.addresses[0]) this.state.actor.addresses[0].primary = true; this.state.commerce.touch(); }, 'Dirección eliminada.'); }
  primary(address: DemoAddress): void { this.state.run(() => { this.state.actor.addresses.forEach(value => value.primary = value.id === address.id); this.state.commerce.touch(); }, 'Dirección principal actualizada.'); }
  saveProfile(): void { if (!this.profileName.trim()) { this.state.error.set('Ingresá tu nombre.'); return; } this.state.run(() => { Object.assign(this.state.actor, { firstName: this.profileName, lastName: this.profileLastName, phone: this.profilePhone }); this.state.commerce.touch(); }, 'Perfil actualizado.'); }
  cancelProfile(): void { this.profileName = this.state.actor.firstName; this.profileLastName = this.state.actor.lastName; this.profilePhone = this.state.actor.phone; }
  saveContent(): void { if (!this.contentTitle.trim()) { this.state.error.set('Ingresá un título.'); return; } this.state.run(() => { this.state.data.title = this.contentTitle; this.state.data.subtitle = this.contentSubtitle; this.state.commerce.touch(); }, 'Contenido publicado en la tienda.'); }
  editCampaign(campaign?: DemoCampaign): void { this.draftCampaign = campaign ? { ...campaign } : { ...this.draftCampaign, id: crypto.randomUUID(), title: '', sku: this.state.data.products[0].sku }; this.open(DemoDialog.Campaign); }
  saveCampaign(): void { if (this.state.run(() => this.state.commerce.saveCampaign(this.draftCampaign), 'Oferta guardada; el precio efectivo se actualiza en tienda.')) this.close(); }
  toggleCampaign(campaign: DemoCampaign): void { this.state.run(() => this.state.commerce.saveCampaign({ ...campaign, active: !campaign.active }), 'Vigencia de la oferta actualizada.'); }
  adjust(product: DemoProduct): void { this.adjustmentSku = product.sku; this.adjustmentDelta = 1; this.adjustmentReason = ''; this.open(DemoDialog.Adjustment); }
  saveAdjustment(): void { if (this.state.run(() => this.state.commerce.adjust(this.adjustmentSku, Number(this.adjustmentDelta), this.adjustmentReason), 'Movimiento de inventario registrado.')) this.close(); }
  advance(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.advance(order.id), 'Estado de entrega actualizado.'); }
  receiveReturn(): void { const order = this.order; if (order) this.state.run(() => this.state.commerce.receiveReturn(order.id), 'Devolución recibida para inspección.'); }
  connectML(): void { this.state.run(() => { this.state.data.mlConnected = !this.state.data.mlConnected; this.state.commerce.touch(); }, this.state.data.mlConnected ? 'Cuenta simulada desconectada.' : 'Cuenta simulada conectada.'); }
  linkML(sku: string): void { this.state.run(() => { const listing = this.state.data.listings.find(value => value.sku === sku); if (listing) listing.linked = !listing.linked; else this.state.data.listings.push({ sku, linked: true, observed: 0, error: false }); this.state.commerce.touch(); }, 'Vínculo simulado actualizado.'); }
  syncML(sku: string): void { this.state.run(() => { if (!this.state.data.mlConnected) throw new Error('Conectá la cuenta simulada primero.'); const listing = this.state.data.listings.find(value => value.sku === sku); if (!listing?.linked) throw new Error('Vinculá el producto primero.'); listing.error = this.state.scenario() === DemoScenario.Error; if (!listing.error) listing.observed = this.state.commerce.available(sku); this.state.commerce.touch(); }, 'Sincronización simulada registrada.'); }
  saleML(sku: string): void { this.state.run(() => this.state.commerce.mlSale(sku, `ml-sale-${sku}`), 'Venta simulada registrada (repetir la misma operación no duplica stock).'); }
  simulateCompetitor(): void { this.state.run(() => { const competitor = this.state.data.competitors[0]; competitor.price = Math.max(100, competitor.price - 10000); competitor.history.push(competitor.price); competitor.unread = true; this.state.commerce.touch(); }, 'Nueva alerta de precio simulada.'); }
  acknowledge(): void { this.state.run(() => { this.state.data.competitors.forEach(value => value.unread = false); this.state.commerce.touch(); }, 'Alertas marcadas como leídas.'); }
  moduleToggle(id: string): void { this.state.run(() => { const module = this.state.data.modules.find(value => value.id === id); if (module) module.enabled = !module.enabled; this.state.commerce.touch(); }, 'Preferencia demo guardada.'); }
  validateManifest(): void { try { const parsed: unknown = JSON.parse(this.manifest); if (!parsed || typeof parsed !== 'object' || !('title' in parsed) || typeof parsed.title !== 'string') throw new Error('El perfil requiere un título de comercio.'); this.information(`Perfil válido. Nuevo título: ${parsed.title}. La importación actualiza solamente el contenido de esta demo.`); } catch { this.state.error.set('El perfil no es JSON válido o le falta title.'); } }
  importManifest(): void { this.state.run(() => { const parsed: unknown = JSON.parse(this.manifest); if (!parsed || typeof parsed !== 'object' || !('title' in parsed) || typeof parsed.title !== 'string' || !parsed.title.trim()) throw new Error('Perfil inválido.'); this.state.data.title = parsed.title; this.state.commerce.touch(); }, 'Perfil importado en la demo.'); }
  exportProfile(): void { const blob = new Blob([JSON.stringify({ version: 1, title: this.state.data.title, subtitle: this.state.data.subtitle }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'comercio-demo.json'; anchor.click(); URL.revokeObjectURL(url); }
}
