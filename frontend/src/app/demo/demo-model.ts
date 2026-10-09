import { OrderStatus } from '../domain/order/order-status';
import { PaymentStatus } from '../domain/order/payment-status';
import { ShipmentStatus } from '../domain/order/shipment-status';
import { DemoPaymentMethod, DemoDeliveryMethod, DemoDeliverySnapshot, DemoSyncJob, DemoSyncStatus, DemoCompetitor } from './demo-process-types';

export class DemoScenario {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Approved = new DemoScenario('approved', 'Pago aprobado');
  static readonly Pending = new DemoScenario('pending', 'Pago pendiente');
  static readonly Rejected = new DemoScenario('rejected', 'Pago rechazado');
  static readonly Error = new DemoScenario('error', 'Error recuperable');
  static readonly NoStock = new DemoScenario('no-stock', 'Falta de stock');
  static readonly Unknown = new DemoScenario('', 'Escenario desconocido');
  static readonly all = [this.Approved, this.Pending, this.Rejected, this.Error, this.NoStock];
  static fromWire(raw: unknown): DemoScenario { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoContext {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Customer = new DemoContext('customer', 'Cliente');
  static readonly Admin = new DemoContext('admin', 'Administración');
  static readonly Unknown = new DemoContext('', 'Visitante');
  static fromWire(raw: unknown): DemoContext { return [this.Customer, this.Admin].find(value => value.wire === raw) ?? this.Unknown; }
}
export class CheckoutStep {
  private constructor(readonly wire: string, readonly label: string, readonly index: number) {}
  static readonly Address = new CheckoutStep('address', 'Dirección', 0);
  static readonly Delivery = new CheckoutStep('delivery', 'Entrega', 1);
  static readonly Review = new CheckoutStep('review', 'Revisión y pago', 2);
  static readonly Unknown = new CheckoutStep('', 'Paso desconocido', -1);
  static readonly all = [this.Address, this.Delivery, this.Review];
  static fromWire(raw: unknown): CheckoutStep { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  next(): CheckoutStep { return CheckoutStep.all[this.index + 1] ?? this; }
  previous(): CheckoutStep { return CheckoutStep.all[this.index - 1] ?? this; }
}
export class DemoProductVariant {
  private constructor(readonly wire: string, readonly label: string, readonly extraUnit: number) {}
  static readonly Standard = new DemoProductVariant('standard', 'Estándar', 0);
  static readonly Case = new DemoProductVariant('with-case', 'Con estuche de transporte', 250000);
  static readonly Unknown = new DemoProductVariant('', 'Variante desconocida', 0);
  static readonly all = [this.Standard, this.Case];
  static fromWire(raw: unknown): DemoProductVariant { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoGalleryView {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Front = new DemoGalleryView('front', 'Vista frontal');
  static readonly Detail = new DemoGalleryView('detail', 'Detalle del producto');
  static readonly Unknown = new DemoGalleryView('', 'Vista desconocida');
  static readonly all = [this.Front, this.Detail];
  static fromWire(raw: unknown): DemoGalleryView { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoModuleId {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Catalog = new DemoModuleId('catalog', 'Catálogo');
  static readonly Checkout = new DemoModuleId('checkout', 'Checkout');
  static readonly Shipping = new DemoModuleId('shipping', 'Envíos');
  static readonly MercadoLibre = new DemoModuleId('ml', 'Mercado Libre');
  static readonly Unknown = new DemoModuleId('', 'Módulo desconocido');
  static readonly all = [this.Catalog, this.Checkout, this.Shipping, this.MercadoLibre];
  static fromWire(raw: unknown): DemoModuleId { return this.all.find(value => value.wire === raw || value.label === raw) ?? this.Unknown; }
}
export interface DemoSettings { homepageItems: number; lowStockThreshold: number; deliveryDays: number; trackingPrefix: string; mlRows: number; }
export interface DemoContentBlock { id: string; title: string; body: string; }
export interface DemoProduct { sku: string; name: string; category: string; brand: string; description: string; price: number; original: number; onHand: number; reserved: number; active: boolean; tone: string; variant: string; supportsCase?: boolean; }
export interface DemoAddress { id: string; label: string; street: string; city: string; postal: string; primary: boolean; }
export interface DemoActor { id: string; email: string; firstName: string; lastName: string; phone: string; addresses: DemoAddress[]; favorites: string[]; cart: { sku: string; quantity: number; variant: DemoProductVariant }[]; }
export interface DemoOrder { id: string; actor: string; request: string; status: OrderStatus; payment: PaymentStatus; shipment: ShipmentStatus; lines: { sku: string; name: string; quantity: number; unit: number; variant?: DemoProductVariant }[]; total: number; address: string; tracking: string; history: string[]; returned: boolean; method?: DemoPaymentMethod; delivery?: DemoDeliverySnapshot; incident?: string; }
export interface DemoCampaign { id: string; title: string; sku: string; percent: number; active: boolean; from: string; until: string; }
export interface DemoListing { sku: string; linked: boolean; observed: number; error: boolean; desired?: number; confirmed?: number; }
export interface DemoMovement { id: string; sku: string; delta: number; reason: string; }
export interface DemoSnapshot { version: number; revision: number; products: DemoProduct[]; actors: DemoActor[]; orders: DemoOrder[]; campaigns: DemoCampaign[]; listings: DemoListing[]; movements: DemoMovement[]; title: string; subtitle: string; blocks: DemoContentBlock[]; settings: DemoSettings; modules: { id: DemoModuleId; enabled: boolean }[]; competitors: DemoCompetitor[]; mlConnected: boolean; syncJobs?: DemoSyncJob[]; }

const NAMES = ['Taladro inalámbrico 20 V', 'Amoladora angular 115 mm', 'Kit de herramientas 108 piezas', 'Atornillador compacto', 'Sierra circular profesional', 'Lijadora orbital', 'Guantes de trabajo', 'Anteojos de protección', 'Casco de seguridad', 'Organizador modular', 'Caja de herramientas', 'Cinta métrica 8 m'];
export function demoSeed(): DemoSnapshot {
  const products = NAMES.map((name, index): DemoProduct => ({ sku: `DEMO-${String(index + 1).padStart(3, '0')}`, name, category: ['Herramientas', 'Seguridad', 'Organización'][Math.floor(index / 6) === 0 ? 0 : index < 9 ? 1 : 2], brand: ['Norte', 'Avance', 'Taller'][index % 3], description: 'Diseñado para trabajar con precisión y comodidad. Calidad durable, garantía de 12 meses y asistencia personalizada. Incluye accesorios y manual de uso.', price: (12500 + index * 8500) * 100, original: (14500 + index * 8500) * 100, onHand: index === 5 ? 0 : index === 8 ? 2 : 18 + index, reserved: 0, active: true, tone: ['#e6a63f', '#667b94', '#a5b49b'][index % 3], variant: 'Estándar' }));
  const actor = (id: string, firstName: string): DemoActor => ({ id, email: `${id}@demo.invalid`, firstName, lastName: 'Demo', phone: '011 5555 0100', addresses: [{ id: `address-${id}`, label: 'Casa', street: 'Avenida de muestra 123', city: 'Buenos Aires', postal: '1406', primary: true }], favorites: [products[0].sku, products[2].sku], cart: [] });
  products.forEach((product, index) => product.supportsCase = index < 6);
  const orders: DemoOrder[] = [ShipmentStatus.Preparing, ShipmentStatus.Shipped, ShipmentStatus.Delivered].map((shipment, index) => ({ id: `DEMO-10${index}`, actor: index === 2 ? 'cliente2' : 'cliente', request: `seed-${index}`, status: OrderStatus.Paid, payment: PaymentStatus.Approved, shipment, lines: [{ sku: products[index].sku, name: products[index].name, quantity: 1, unit: products[index].price }], total: products[index].price, address: 'Avenida de muestra 123 · Buenos Aires', tracking: shipment === ShipmentStatus.Preparing ? '' : `SIM-000${index}`, history: ['Pedido creado · 08/10/2026', 'Pago aprobado (simulado)', shipment.label], returned: false }));
  return { version: 1, revision: 0, products, actors: [actor('cliente', 'Alex'), actor('cliente2', 'Sam')], orders, campaigns: [{ id: 'offer-1', title: 'Equipá tu taller', sku: products[0].sku, percent: 10, active: true, from: '2026-01-01', until: '2027-12-31' }], listings: products.slice(0, 4).map(product => ({ sku: product.sku, linked: true, observed: product.onHand, error: false })), movements: [], title: 'Todo para tu próximo proyecto', subtitle: 'Herramientas, seguridad y organización. Elegí calidad, comprá con confianza.', blocks: [{ id: 'service', title: 'Te ayudamos a elegir', body: 'Encontrá herramientas y equipamiento para cada etapa de tu proyecto.' }, { id: 'quality', title: 'Calidad que te acompaña', body: 'Garantía y asistencia personalizada para trabajar con confianza.' }], settings: { homepageItems: 4, lowStockThreshold: 5, deliveryDays: 5, trackingPrefix: 'SIM', mlRows: 6 }, modules: DemoModuleId.all.map(id => ({ id, enabled: true })), competitors: [{ id: 'competitor-1', name: 'Comercio de muestra A', price: products[0].price + 50000, history: [products[0].price + 80000, products[0].price + 50000], unread: false }], mlConnected: false };
}

/** All financial amounts are integer minor units; this coordinator is framework-free. */
export class DemoCommerce {
  constructor(public snapshot: DemoSnapshot = demoSeed(), private readonly now: () => string = () => new Date().toISOString(), private readonly id: () => string = () => crypto.randomUUID()) {}
  private commit(projectStock = false): void { this.snapshot.revision++; if (projectStock) this.queueStock(); }
  private queueStock(): void {
    this.snapshot.syncJobs ??= [];
    for (const listing of this.snapshot.listings.filter(value => value.linked)) {
      const desired = this.product(listing.sku).onHand;
      if (listing.desired === desired) continue;
      listing.desired = desired;
      this.snapshot.syncJobs.push({ id: `stock-${this.snapshot.revision}-${listing.sku}`, sku: listing.sku, desired, status: DemoSyncStatus.Queued, created: this.now() });
    }
  }
  private requireModule(id: DemoModuleId): void { if (!this.snapshot.modules.some(module => module.id === id && module.enabled)) throw new Error(`${id.label} está pausado en la demostración. Habilitalo desde Módulos del comercio.`); }
  actor(id: string): DemoActor { const actor = this.snapshot.actors.find(value => value.id === id); if (!actor) throw new Error('Elegí una identidad de demostración.'); return actor; }
  product(sku: string): DemoProduct { const product = this.snapshot.products.find(value => value.sku === sku); if (!product) throw new Error('Producto no encontrado.'); return product; }
  available(sku: string): number { const product = this.product(sku); return product.onHand - product.reserved; }
  price(sku: string): number { const product = this.product(sku); const offer = this.snapshot.campaigns.find(value => value.sku === sku && value.active && value.from <= this.now().slice(0, 10) && value.until >= this.now().slice(0, 10)); return offer ? Math.round(product.price * (100 - offer.percent) / 100) : product.price; }
  setQuantity(actorId: string, sku: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > this.available(sku)) throw new Error('La cantidad supera el stock disponible.');
    const actor = this.actor(actorId); const existing = actor.cart.find(line => line.sku === sku);
    if (quantity === 0) actor.cart = actor.cart.filter(line => line.sku !== sku); else if (existing) existing.quantity = quantity; else actor.cart.push({ sku, quantity, variant: DemoProductVariant.Standard });
    this.commit();
  }
  add(actorId: string, sku: string, quantity: number, variant = DemoProductVariant.Standard): void {
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Ingresá una cantidad entera de al menos 1 unidad.');
    const product = this.product(sku);
    if (!product.active) throw new Error('Este producto está archivado y no se puede comprar.');
    if (variant === DemoProductVariant.Unknown) throw new Error('Seleccioná una variante conocida.');
    if (variant === DemoProductVariant.Case && product.supportsCase !== true) throw new Error('La presentación con estuche no está disponible para este producto.');
    const existing = this.actor(actorId).cart.find(line => line.sku === sku);
    if (existing && existing.variant !== variant) throw new Error('Este producto ya está en tu carrito con otra presentación. Quitalo antes de cambiar la variante.');
    this.setQuantity(actorId, sku, (existing?.quantity ?? 0) + quantity);
    const saved = this.actor(actorId).cart.find(line => line.sku === sku); if (saved) saved.variant = variant;
  }
  favorite(actorId: string, sku: string): void { const actor = this.actor(actorId); actor.favorites = actor.favorites.includes(sku) ? actor.favorites.filter(value => value !== sku) : [...actor.favorites, sku]; this.commit(); }
  checkout(actorId: string, request: string, addressId: string, scenario: DemoScenario, method = DemoPaymentMethod.Card, deliveryMethod?: DemoDeliveryMethod): DemoOrder {
    const existing = this.snapshot.orders.find(order => order.actor === actorId && order.request === request); if (existing) return existing;
    this.requireModule(DemoModuleId.Checkout);
    if (scenario === DemoScenario.Error) throw new Error('El pago simulado no respondió. Conservamos tu carrito; seleccioná pago aprobado y reintentá.');
    if (scenario === DemoScenario.Unknown || method === DemoPaymentMethod.Unknown || deliveryMethod === DemoDeliveryMethod.Unknown) throw new Error('Elegí un escenario, pago y entrega válidos.');
    const actor = this.actor(actorId); const address = actor.addresses.find(value => value.id === addressId);
    if ((!address && deliveryMethod !== DemoDeliveryMethod.Pickup) || !actor.cart.length) throw new Error('Agregá productos y seleccioná una dirección.');
    if (scenario === DemoScenario.NoStock || actor.cart.some(line => this.available(line.sku) < line.quantity)) throw new Error('El stock cambió. Revisá las cantidades de tu carrito.');
    if (actor.cart.some(line => !this.product(line.sku).active)) throw new Error('Un producto del carrito está archivado. Revisá el carrito y quitalo antes de confirmar.');
    if (actor.cart.some(line => line.variant === DemoProductVariant.Unknown)) throw new Error('El carrito contiene una variante no reconocida.');
    if (actor.cart.some(line => line.variant === DemoProductVariant.Case && this.product(line.sku).supportsCase !== true)) throw new Error('Una presentación dejó de estar disponible. Quitá el producto y seleccioná otra variante.');
    const lines = actor.cart.map(line => ({ ...line, name: `${this.product(line.sku).name} · ${line.variant.label}`, unit: this.price(line.sku) + line.variant.extraUnit }));
    const approved = scenario === DemoScenario.Approved; const rejected = scenario === DemoScenario.Rejected;
    const order: DemoOrder = { id: `DEMO-${this.id()}`, actor: actorId, request, status: approved ? OrderStatus.Paid : rejected ? OrderStatus.Cancelled : OrderStatus.PendingPayment, payment: approved ? PaymentStatus.Approved : rejected ? PaymentStatus.Rejected : PaymentStatus.Pending, shipment: ShipmentStatus.Preparing, lines, total: lines.reduce((sum, line) => sum + line.unit * line.quantity, 0), address: address ? `${address.street} · ${address.city}` : 'Retiro en comercio de muestra', tracking: '', history: [`Pedido creado · ${this.now()}`, `Pago ${scenario.label.toLowerCase()} (simulado)`], returned: false };
    order.method = method;
    if (deliveryMethod) { order.delivery = { method: deliveryMethod, cost: deliveryMethod.cost, days: deliveryMethod === DemoDeliveryMethod.Home ? this.snapshot.settings.deliveryDays : deliveryMethod.days, destination: deliveryMethod === DemoDeliveryMethod.Pickup ? 'Comercio de muestra · Retiro con DNI y número de pedido' : `${address!.street} · ${address!.city} · CP ${address!.postal}` }; order.address = order.delivery.destination; order.total += order.delivery.cost; }
    for (const line of lines) { const product = this.product(line.sku); if (approved) { product.onHand -= line.quantity; this.snapshot.movements.push({ id: `${order.id}-${line.sku}`, sku: line.sku, delta: -line.quantity, reason: `Compra ${order.id}` }); } else if (!rejected) product.reserved += line.quantity; }
    this.snapshot.orders.push(order); actor.cart = []; this.commit(approved); return order;
  }
  resolvePayment(orderId: string, scenario: DemoScenario): void {
    const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no encontrado.');
    if (order.payment !== PaymentStatus.Pending) throw new Error('Este pago ya tiene un resultado definitivo.');
    if (order.method === DemoPaymentMethod.Unknown || order.delivery?.method === DemoDeliveryMethod.Unknown) throw new Error('El pedido contiene un método no reconocido.');
    if (scenario !== DemoScenario.Approved && scenario !== DemoScenario.Rejected) throw new Error('Elegí aprobado o rechazado.');
    for (const line of order.lines) { const product = this.product(line.sku); product.reserved -= line.quantity; if (scenario === DemoScenario.Approved) { product.onHand -= line.quantity; this.snapshot.movements.push({ id: `${order.id}-${line.sku}`, sku: line.sku, delta: -line.quantity, reason: `Pago ${order.id}` }); } }
    order.payment = scenario === DemoScenario.Approved ? PaymentStatus.Approved : PaymentStatus.Rejected; order.status = scenario === DemoScenario.Approved ? OrderStatus.Paid : OrderStatus.Cancelled; order.history.push(order.payment.label); this.commit(scenario === DemoScenario.Approved);
  }
  cancelPayment(orderId: string): void {
    const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no encontrado.');
    if (order.payment === PaymentStatus.Cancelled) return;
    if (order.payment !== PaymentStatus.Pending) throw new Error('Solo un pago pendiente puede cancelarse.');
    for (const line of order.lines) this.product(line.sku).reserved -= line.quantity;
    order.payment = PaymentStatus.Cancelled; order.status = OrderStatus.Cancelled; order.history.push(`Pago cancelado · reserva liberada · ${this.now()}`); this.commit();
  }
  reportIncident(orderId: string, reason: string): void { const order = this.snapshot.orders.find(value => value.id === orderId); if (!order || order.payment !== PaymentStatus.Approved || !reason.trim()) throw new Error('Indicá una incidencia para un pedido aprobado.'); order.incident = reason.trim(); order.history.push(`Incidencia: ${order.incident} · ${this.now()}`); this.commit(); }
  resolveIncident(orderId: string): void { const order = this.snapshot.orders.find(value => value.id === orderId); if (!order?.incident) throw new Error('No hay incidencia pendiente.'); order.incident = ''; order.history.push(`Incidencia resuelta · ${this.now()}`); this.commit(); }
  advance(orderId: string): void { this.requireModule(DemoModuleId.Shipping); const order = this.snapshot.orders.find(value => value.id === orderId); if (!order || order.payment !== PaymentStatus.Approved) throw new Error('El pedido necesita pago aprobado.'); if (order.shipment === ShipmentStatus.Preparing) { order.shipment = ShipmentStatus.Shipped; order.tracking = `${this.snapshot.settings.trackingPrefix}-${order.id}`; } else if (order.shipment === ShipmentStatus.Shipped) order.shipment = ShipmentStatus.Delivered; else throw new Error('La entrega ya está finalizada.'); order.history.push(`${order.shipment.label} · ${this.now()}`); this.commit(); }
  receiveReturn(orderId: string): void { const order = this.snapshot.orders.find(value => value.id === orderId); if (!order || order.shipment !== ShipmentStatus.Delivered || order.returned) throw new Error('La devolución no está disponible.'); order.returned = true; order.history.push('Devolución recibida; inspección pendiente. Sin reintegro automático de stock.'); this.commit(); }
  adjust(sku: string, delta: number, reason: string): void { const product = this.product(sku); if (!Number.isInteger(delta) || !reason.trim() || product.onHand + delta < product.reserved) throw new Error('Indicá unidades enteras y motivo; el stock no puede ser menor a las reservas.'); product.onHand += delta; this.snapshot.movements.push({ id: this.id(), sku, delta, reason }); this.commit(true); }
  mlSale(sku: string, operation: string): void { this.requireModule(DemoModuleId.MercadoLibre); if (!this.snapshot.mlConnected || !this.snapshot.listings.some(value => value.sku === sku && value.linked)) throw new Error('Conectá la cuenta simulada y vinculá el producto.'); if (this.snapshot.movements.some(value => value.id === operation)) return; if (this.available(sku) < 1) throw new Error('Producto sin stock.'); this.product(sku).onHand--; this.snapshot.movements.push({ id: operation, sku, delta: -1, reason: 'Venta Mercado Libre simulada' }); this.commit(true); }
  processStock(fail = false): void {
    this.requireModule(DemoModuleId.MercadoLibre); if (!this.snapshot.mlConnected) throw new Error('Conectá la cuenta simulada primero.');
    this.queueStock();
    for (const job of this.snapshot.syncJobs ?? []) { if (job.status === DemoSyncStatus.Confirmed || job.status === DemoSyncStatus.Unknown || job.status === DemoSyncStatus.Superseded) continue; const listing = this.snapshot.listings.find(value => value.sku === job.sku); if (!listing?.linked) continue; if (job.desired !== listing.desired) { job.status = DemoSyncStatus.Superseded; continue; } job.status = fail ? DemoSyncStatus.Failed : DemoSyncStatus.Confirmed; listing.error = fail; if (!fail) { listing.observed = job.desired; listing.confirmed = job.desired; } }
    this.commit();
  }
  watchCompetitor(name: string, sku: string, threshold: number): void { this.product(sku); if (!name.trim() || !Number.isInteger(threshold) || threshold < 1 || threshold > 100) throw new Error('Indicá nombre, producto y umbral entre 1 y 100%.'); this.snapshot.competitors.push({ id: this.id(), name: name.trim(), sku, threshold, enabled: true, price: this.price(sku), history: [this.price(sku)], unread: false }); this.commit(); }
  competitorPrice(id: string, price: number): void { const competitor = this.snapshot.competitors.find(value => value.id === id); if (!competitor || !Number.isSafeInteger(price) || price < 100) throw new Error('Indicá un precio de muestra válido.'); const percent = Math.abs(price - competitor.price) * 100 / competitor.price; competitor.price = price; competitor.history.push(price); if (competitor.enabled !== false && percent >= (competitor.threshold ?? 1)) competitor.unread = true; this.commit(); }
  saveSettings(settings: DemoSettings): void { if (![settings.homepageItems, settings.lowStockThreshold, settings.deliveryDays, settings.mlRows].every(value => Number.isInteger(value) && value >= 1 && value <= 30) || !/^[A-Z0-9-]{2,12}$/.test(settings.trackingPrefix)) throw new Error('Indicá valores enteros de 1 a 30 y un prefijo de seguimiento de 2–12 letras/números.'); this.snapshot.settings = { ...settings }; this.commit(); }
  saveProduct(product: DemoProduct, editingSku?: string): void {
    this.requireModule(DemoModuleId.Catalog);
    const existing = this.snapshot.products.find(value => value.sku === (editingSku ?? product.sku));
    if (!editingSku && existing) throw new Error('El SKU ya existe. Editá el producto existente.');
    if (editingSku && (!existing || product.sku !== editingSku)) throw new Error('No se puede cambiar el SKU de un producto existente.');
    const reserved = existing?.reserved ?? 0;
    if (!product.name.trim() || !product.sku.trim() || !Number.isSafeInteger(product.price) || product.price <= 0 || !Number.isInteger(product.onHand) || product.onHand < reserved) throw new Error('Revisá nombre, SKU, precio y stock; respetá las reservas existentes.');
    if (existing) Object.assign(existing, { ...product, reserved }); else this.snapshot.products.push({ ...product, reserved: 0 });
    this.commit(true);
  }
  saveCampaign(campaign: DemoCampaign): void { this.requireModule(DemoModuleId.Catalog); if (!campaign.title.trim() || !this.snapshot.products.some(value => value.sku === campaign.sku) || campaign.percent <= 0 || campaign.percent > 70 || campaign.from > campaign.until) throw new Error('Revisá el título, producto, descuento (1–70%) y vigencia.'); const index = this.snapshot.campaigns.findIndex(value => value.id === campaign.id); if (index < 0) this.snapshot.campaigns.push({ ...campaign }); else this.snapshot.campaigns[index] = { ...campaign }; this.commit(); }
  touch(): void { this.commit(); }
}

/** Single persistence boundary rehydrates canonical closed statuses and checks stock invariants. */
export function decodeSnapshot(raw: string): DemoSnapshot {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Snapshot inválido.');
  const state = parsed as DemoSnapshot;
  if (state.version !== 1 || !Number.isInteger(state.revision) || !Array.isArray(state.products) || !Array.isArray(state.actors) || !Array.isArray(state.orders) || !Array.isArray(state.campaigns) || !Array.isArray(state.listings) || !Array.isArray(state.movements) || !Array.isArray(state.modules) || !Array.isArray(state.competitors)) throw new Error('La demo guardada tiene otra versión. Restablecé sus datos.');
  if (state.products.some(value => !value.sku || !Number.isSafeInteger(value.price) || value.price <= 0 || !Number.isInteger(value.onHand) || !Number.isInteger(value.reserved) || value.reserved < 0 || value.onHand < value.reserved)) throw new Error('Stock o precios inválidos. Restablecé la demostración.');
  const skus = new Set(state.products.map(product => product.sku));
  if (skus.size !== state.products.length || !state.actors.some(actor => actor.id === 'cliente') || state.actors.some(actor => !actor.id || typeof actor.email !== 'string' || typeof actor.firstName !== 'string' || !Array.isArray(actor.addresses) || !Array.isArray(actor.cart) || !Array.isArray(actor.favorites) || actor.cart.some(line => !skus.has(line.sku) || !Number.isInteger(line.quantity) || line.quantity < 1) || actor.addresses.some(address => !address.id || typeof address.street !== 'string' || typeof address.city !== 'string' || typeof address.postal !== 'string'))) throw new Error('La identidad o el carrito demo guardado son inválidos. Restablecé la demostración.');
  if (state.orders.some(order => !order.id || !state.actors.some(actor => actor.id === order.actor) || !Array.isArray(order.lines) || !Array.isArray(order.history) || !Number.isSafeInteger(order.total) || order.total < 0 || order.lines.some(line => !skus.has(line.sku) || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.unit) || line.unit < 0))) throw new Error('El historial demo guardado es inválido. Restablecé la demostración.');
  state.orders = state.orders.map(order => ({ ...order, status: OrderStatus.fromWire(order.status?.wire), payment: PaymentStatus.fromWire(order.payment?.wire), shipment: ShipmentStatus.fromWire(order.shipment?.wire), method: order.method ? DemoPaymentMethod.fromWire(order.method.wire) : DemoPaymentMethod.Card, delivery: order.delivery ? { ...order.delivery, method: DemoDeliveryMethod.fromWire(order.delivery.method?.wire) } : undefined }));
  state.syncJobs = (state.syncJobs ?? []).map(job => ({ ...job, status: DemoSyncStatus.fromWire(job.status?.wire) }));
  if (state.syncJobs.some(job => !skus.has(job.sku) || !Number.isInteger(job.desired) || job.desired < 0) || state.orders.some(order => order.delivery && (!Number.isSafeInteger(order.delivery.cost) || order.delivery.cost < 0 || !Number.isInteger(order.delivery.days) || order.delivery.days < 1 || typeof order.delivery.destination !== 'string')) || state.competitors.some(value => !value.id || typeof value.name !== 'string' || !Number.isSafeInteger(value.price) || value.price < 100 || !Array.isArray(value.history))) throw new Error('Los procesos demo guardados son inválidos. Restablecé la demostración.');
  state.orders = state.orders.map(order => ({ ...order, lines: order.lines.map(line => ({ ...line, variant: line.variant ? DemoProductVariant.fromWire(line.variant.wire) : DemoProductVariant.Standard })) }));
  state.actors = state.actors.map(actor => ({ ...actor, cart: actor.cart.map(line => ({ ...line, variant: line.variant ? DemoProductVariant.fromWire(line.variant.wire) : DemoProductVariant.Standard })) }));
  state.modules = state.modules.map(module => ({ ...module, id: DemoModuleId.fromWire(typeof module.id === 'string' ? module.id : module.id?.wire) }));
  state.blocks ??= demoSeed().blocks;
  state.settings ??= demoSeed().settings;
  if (!Array.isArray(state.blocks) || state.blocks.some(block => typeof block.id !== 'string' || typeof block.title !== 'string' || typeof block.body !== 'string') || ![state.settings.homepageItems, state.settings.lowStockThreshold, state.settings.deliveryDays, state.settings.mlRows].every(value => Number.isInteger(value) && value >= 1 && value <= 30) || !/^[A-Z0-9-]{2,12}$/.test(state.settings.trackingPrefix)) throw new Error('La configuración demo guardada es inválida. Restablecé la demostración.');
  return state;
}
