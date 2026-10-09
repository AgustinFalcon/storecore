import { OrderStatus } from '../domain/order/order-status';
import { DemoFulfillment, DemoFulfillmentPhase, DemoFulfillmentAction, DemoFulfillmentPolicy, DemoIncidentKind, ensureFulfillment, decodeFulfillment } from './demo-fulfillment';
import { DemoInbox, decodeInbox } from './demo-inbox';
import { DemoReturnRequest, DemoReturnSelection, DemoReturnStatus, DemoReturnReason, DemoReturnDisposition, DemoPostSaleAlert, DemoReturnPolicy, DemoRefundAllocation, DemoReturnDecision, DemoReturnInspection, DemoReturnRefund, decodePostSale } from './demo-postsale';
import { DemoMedia, DemoSellableVariant, DEMO_MEDIA, DemoCurrency, validateMedia, validateVariants } from './demo-catalog';
export type { DemoMedia, DemoSellableVariant } from './demo-catalog';
export { DEMO_MEDIA, DemoCurrency } from './demo-catalog';
import { PaymentStatus } from '../domain/order/payment-status';
import { ShipmentStatus } from '../domain/order/shipment-status';
import { DemoPaymentMethod, DemoDeliveryMethod, DemoDeliverySnapshot, DemoSyncJob, DemoSyncStatus, DemoCompetitor } from './demo-process-types';
import { DemoMLAccountStatus, DemoMarketplaceProjection, DemoMarketplaceMapping, DemoMarketplaceProcessor, DemoCompetitorObservationStep, ensureMarketplace, decodeMarketplace } from './demo-marketplace';

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
export interface DemoProduct { sku: string; name: string; category: string; brand: string; description: string; price: number; original: number; onHand: number; reserved: number; active: boolean; tone: string; variant: string; supportsCase?: boolean; variants?: DemoSellableVariant[]; images?: DemoMedia[]; }
export interface DemoAddress { id: string; label: string; street: string; city: string; postal: string; primary: boolean; }
export interface DemoActor { id: string; email: string; firstName: string; lastName: string; phone: string; addresses: DemoAddress[]; favorites: string[]; cart: { sku: string; quantity: number; variant: DemoProductVariant; variantId?: string; quotedUnit?: number }[]; }
export interface DemoOrder { id: string; actor: string; request: string; status: OrderStatus; payment: PaymentStatus; shipment: ShipmentStatus; lines: { sku: string; name: string; quantity: number; unit: number; variant?: DemoProductVariant; variantId?: string; variantName?: string; attributes?: { name: string; value: string }[]; image?: DemoMedia; originalUnit?: number; discountUnit?: number; currency?: DemoCurrency }[]; total: number; address: string; tracking: string; history: string[]; returned: boolean; method?: DemoPaymentMethod; delivery?: DemoDeliverySnapshot; incident?: string; returns?: DemoReturnRequest[]; }
export interface DemoCampaign { id: string; title: string; sku: string; percent: number; active: boolean; from: string; until: string; }
export interface DemoListing { sku: string; linked: boolean; observed?: number; error: boolean; desired?: number; confirmed?: number; }
export interface DemoMovement { id: string; sku: string; variantId?: string; delta: number; reason: string; }
export interface DemoSnapshot { version: number; revision: number; products: DemoProduct[]; actors: DemoActor[]; orders: DemoOrder[]; campaigns: DemoCampaign[]; listings: DemoListing[]; movements: DemoMovement[]; title: string; subtitle: string; blocks: DemoContentBlock[]; settings: DemoSettings; modules: { id: DemoModuleId; enabled: boolean }[]; competitors: DemoCompetitor[]; mlConnected: boolean; syncJobs?: DemoSyncJob[]; postSaleAlerts?: DemoPostSaleAlert[]; }

const NAMES = ['Taladro inalámbrico 20 V', 'Amoladora angular 115 mm', 'Kit de herramientas 108 piezas', 'Atornillador compacto', 'Sierra circular profesional', 'Lijadora orbital', 'Guantes de trabajo', 'Anteojos de protección', 'Casco de seguridad', 'Organizador modular', 'Caja de herramientas', 'Cinta métrica 8 m'];
export function initializeProductVariants(product: DemoProduct): void {
  if (product.variants?.length) return;
  const index = Math.max(0, Number(product.sku.match(/\d+$/)?.[0] ?? 1) - 1) % DEMO_MEDIA.length;
  product.images ??= [{ id: `${product.sku}-front`, src: DEMO_MEDIA[index], alt: `${product.name}, vista principal` }, { id: `${product.sku}-detail`, src: DEMO_MEDIA[(index + 1) % DEMO_MEDIA.length], alt: `${product.name}, accesorios de muestra` }];
  product.variants = [{ id: `${product.sku}:standard`, name: product.variant || 'Estándar', attributes: [{ name: 'Presentación', value: product.variant || 'Estándar' }], price: product.price, onHand: product.onHand, reserved: product.reserved, active: true, images: product.images.map(image => ({ ...image })) }];
  if (product.supportsCase) { const caseStock = Math.min(3, Math.max(0, product.onHand - product.reserved)); product.variants[0].onHand -= caseStock; product.variants.push({ id: `${product.sku}:with-case`, name: 'Con estuche de transporte', attributes: [{ name: 'Presentación', value: 'Con estuche' }], price: product.price + DemoProductVariant.Case.extraUnit, onHand: caseStock, reserved: 0, active: true, images: product.images[1] ? [ { ...product.images[1] } ] : [] }); }
}

export interface DemoOrder { fulfillment?: DemoFulfillment; }
export interface DemoSnapshot { inbox?: DemoInbox; }
export interface DemoSnapshot { marketplace?: import('./demo-marketplace').DemoMarketState; }
export function demoSeed(): DemoSnapshot {
  const products = NAMES.map((name, index): DemoProduct => ({ sku: `DEMO-${String(index + 1).padStart(3, '0')}`, name, category: ['Herramientas', 'Seguridad', 'Organización'][Math.floor(index / 6) === 0 ? 0 : index < 9 ? 1 : 2], brand: ['Norte', 'Avance', 'Taller'][index % 3], description: 'Diseñado para trabajar con precisión y comodidad. Calidad durable, garantía de 12 meses y asistencia personalizada. Incluye accesorios y manual de uso.', price: (12500 + index * 8500) * 100, original: (14500 + index * 8500) * 100, onHand: index === 5 ? 0 : index === 8 ? 2 : 18 + index, reserved: 0, active: true, tone: ['#e6a63f', '#667b94', '#a5b49b'][index % 3], variant: 'Estándar' }));
  const actor = (id: string, firstName: string): DemoActor => ({ id, email: `${id}@demo.invalid`, firstName, lastName: 'Demo', phone: '011 5555 0100', addresses: [{ id: `address-${id}`, label: 'Casa', street: 'Avenida de muestra 123', city: 'Buenos Aires', postal: '1406', primary: true }], favorites: [products[0].sku, products[2].sku], cart: [] });
  products.forEach((product, index) => { product.supportsCase = index < 6; initializeProductVariants(product); });
  const orders: DemoOrder[] = [ShipmentStatus.Preparing, ShipmentStatus.Shipped, ShipmentStatus.Delivered].map((shipment, index) => ({ id: `DEMO-10${index}`, actor: index === 2 ? 'cliente2' : 'cliente', request: `seed-${index}`, status: OrderStatus.Paid, payment: PaymentStatus.Approved, shipment, lines: [{ sku: products[index].sku, name: products[index].name, quantity: 1, unit: products[index].price, variantId: products[index].variants![0].id, variantName: products[index].variants![0].name, attributes: products[index].variants![0].attributes.map(attribute=>({...attribute})), originalUnit: products[index].price, discountUnit: 0, currency: DemoCurrency.ARS, image: products[index].images?.[0] ? {...products[index].images[0]} : undefined }], total: products[index].price, address: 'Avenida de muestra 123 · Buenos Aires', tracking: shipment === ShipmentStatus.Preparing ? '' : `SIM-000${index}`, history: ['Pedido creado · 08/10/2026', 'Pago aprobado (simulado)', shipment.label], returned: false }));
  return { version: 4, revision: 0, products, actors: [actor('cliente', 'Alex'), actor('cliente2', 'Sam')], orders, campaigns: [{ id: 'offer-1', title: 'Equipá tu taller', sku: products[0].sku, percent: 10, active: true, from: '2026-01-01', until: '2027-12-31' }], listings: products.slice(0, 4).map(product => ({ sku: product.sku, linked: true, observed: product.onHand, error: false })), movements: [], title: 'Todo para tu próximo proyecto', subtitle: 'Herramientas, seguridad y organización. Elegí calidad, comprá con confianza.', blocks: [{ id: 'service', title: 'Te ayudamos a elegir', body: 'Encontrá herramientas y equipamiento para cada etapa de tu proyecto.' }, { id: 'quality', title: 'Calidad que te acompaña', body: 'Garantía y asistencia personalizada para trabajar con confianza.' }], settings: { homepageItems: 4, lowStockThreshold: 5, deliveryDays: 5, trackingPrefix: 'SIM', mlRows: 6 }, modules: DemoModuleId.all.map(id => ({ id, enabled: true })), competitors: [{ id: 'competitor-1', name: 'Comercio de muestra A', price: products[0].price + 50000, history: [products[0].price + 80000, products[0].price + 50000], unread: false }], mlConnected: false };
}

/** All financial amounts are integer minor units; this coordinator is framework-free. */
export class DemoCommerce {
  constructor(public snapshot: DemoSnapshot = demoSeed(), private readonly now: () => string = () => new Date().toISOString(), private readonly id: () => string = () => crypto.randomUUID()) {}
  variants(sku: string): DemoSellableVariant[] { const product = this.product(sku); initializeProductVariants(product); return product.variants!; }
  sellable(sku: string, variantId?: string): DemoSellableVariant { const variants = this.variants(sku); const variant = variants.find(value => value.id === (variantId ?? variants[0].id)); if (!variant) throw new Error('La variante no está disponible. Revisá el carrito.'); return variant; }
  variantAvailable(sku: string, variantId: string): number { const variant = this.sellable(sku, variantId); return variant.active && this.product(sku).active ? variant.onHand - variant.reserved : 0; }
  variantPrice(sku: string, variantId: string): number { const variant = this.sellable(sku, variantId); const offer = this.snapshot.campaigns.find(value => value.sku === sku && value.active && value.from <= this.now().slice(0,10) && value.until >= this.now().slice(0,10)); return offer ? Math.round(variant.price * (100-offer.percent)/100) : variant.price; }
  private projectProduct(sku: string): void { const product = this.product(sku); product.onHand = this.variants(sku).reduce((sum, variant) => sum + variant.onHand, 0); product.reserved = this.variants(sku).reduce((sum, variant) => sum + variant.reserved, 0); product.price = this.variants(sku)[0].price; }
  refreshCart(actorId: string): void { const lines = this.actor(actorId).cart; for (const line of lines) { const variant = this.sellable(line.sku, line.variantId); if (!variant.active || !this.product(line.sku).active || line.quantity > this.variantAvailable(line.sku, variant.id)) throw new Error('Revisá la disponibilidad y las cantidades de tu carrito.'); } for (const line of lines) line.quotedUnit = this.variantPrice(line.sku, line.variantId!); this.commit(); }
  private stockLine(line: { sku: string; variantId?: string }, onHandDelta: number, reservedDelta: number): void { const variant = this.sellable(line.sku, line.variantId); if (variant.reserved + reservedDelta < 0 || variant.onHand + onHandDelta < variant.reserved + reservedDelta) throw new Error('El inventario de la variante no permite esta operación.'); variant.onHand += onHandDelta; variant.reserved += reservedDelta; this.projectProduct(line.sku); }
  private commit(projectStock = false): void { this.snapshot.revision++; this.snapshot.version = 5; if (projectStock) ensureMarketplace(this.snapshot, this.now()); this.queueStock(); }
  private queueStock(): void {
    ensureMarketplace(this.snapshot, this.now()); new DemoMarketplaceProjection().refresh(this.snapshot, this.now());
    this.snapshot.syncJobs = this.snapshot.marketplace!.queue.map(job => ({ id: job.id, sku: this.snapshot.marketplace!.mappings.find(mapping => mapping.id === job.mappingId)!.sku, desired: job.desired, status: job.status, created: job.created }));
  }
  private requireModule(id: DemoModuleId): void { if (!this.snapshot.modules.some(module => module.id === id && module.enabled)) throw new Error(`${id.label} está pausado en la demostración. Habilitalo desde Módulos del comercio.`); }
  actor(id: string): DemoActor { const actor = this.snapshot.actors.find(value => value.id === id); if (!actor) throw new Error('Elegí una identidad de demostración.'); return actor; }
  product(sku: string): DemoProduct { const product = this.snapshot.products.find(value => value.sku === sku); if (!product) throw new Error('Producto no encontrado.'); return product; }
  available(sku: string): number { return this.variants(sku).filter(variant => variant.active).reduce((sum, variant) => sum + variant.onHand - variant.reserved, 0); }
  price(sku: string): number { const product = this.product(sku); const offer = this.snapshot.campaigns.find(value => value.sku === sku && value.active && value.from <= this.now().slice(0, 10) && value.until >= this.now().slice(0, 10)); return offer ? Math.round(product.price * (100 - offer.percent) / 100) : product.price; }
  setQuantity(actorId: string, sku: string, quantity: number, variantId?: string): void {
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Ingresá una cantidad entera de al menos 1 unidad. Para quitar el producto usá Quitar.');
    const variant = this.sellable(sku, variantId);
    if (quantity > this.variantAvailable(sku, variant.id)) throw new Error('La cantidad supera el stock disponible de esta variante.');
    const actor = this.actor(actorId); const existing = actor.cart.find(line => line.variantId === variant.id);
    if (existing) existing.quantity = quantity; else actor.cart.push({ sku, quantity, variant: DemoProductVariant.Standard, variantId: variant.id, quotedUnit: this.variantPrice(sku, variant.id) });
    this.commit();
  }
  add(actorId: string, sku: string, quantity: number, variant: DemoProductVariant | string = DemoProductVariant.Standard): void {
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Ingresá una cantidad entera de al menos 1 unidad.');
    const product = this.product(sku);
    if (!product.active) throw new Error('Este producto está archivado y no se puede comprar.');
    if (variant === DemoProductVariant.Unknown) throw new Error('Seleccioná una variante conocida.');
    if (variant === DemoProductVariant.Case && product.supportsCase !== true) throw new Error('La presentación con estuche no está disponible para este producto.');
    const selected = this.sellable(sku, typeof variant === 'string' ? variant : `${sku}:${variant.wire}`);
    const existing = this.actor(actorId).cart.find(line => line.variantId === selected.id);
    this.setQuantity(actorId, sku, (existing?.quantity ?? 0) + quantity, selected.id);
    const saved = this.actor(actorId).cart.find(line => line.variantId === selected.id); if (saved) saved.variant = typeof variant === 'string' ? DemoProductVariant.Standard : variant;
  }
  favorite(actorId: string, sku: string): void { const actor = this.actor(actorId); actor.favorites = actor.favorites.includes(sku) ? actor.favorites.filter(value => value !== sku) : [...actor.favorites, sku]; this.commit(); }
  /** Recover exact identities, validating the entire retry before changing the cart. */
  retryOrder(actorId: string, orderId: string): void {
    const order = this.snapshot.orders.find(value => value.id === orderId && value.actor === actorId);
    if (!order || (order.payment !== PaymentStatus.Rejected && order.payment !== PaymentStatus.Cancelled)) throw new Error('Este pedido no permite recuperar el carrito.');
    const actor = this.actor(actorId);
    const recovered = actor.cart.map(line => ({ ...line }));
    for (const line of order.lines) {
      if (!line.variantId) throw new Error('El pedido no conserva la identidad de su variante.');
      const variant = this.sellable(line.sku, line.variantId);
      if (!variant.active || !this.product(line.sku).active) throw new Error('La variante del pedido está archivada. No se recuperó el carrito.');
      const existing = recovered.find(value => value.variantId === variant.id);
      const quantity = (existing?.quantity ?? 0) + line.quantity;
      if (quantity > this.variantAvailable(line.sku, variant.id)) throw new Error('La variante del pedido no tiene stock disponible. No se recuperó el carrito.');
      if (existing) existing.quantity = quantity;
      else recovered.push({ sku: line.sku, variantId: variant.id, variant: DemoProductVariant.Standard, quantity, quotedUnit: this.variantPrice(line.sku, variant.id) });
    }
    actor.cart = recovered;
    this.commit();
  }
  checkout(actorId: string, request: string, addressId: string, scenario: DemoScenario, method = DemoPaymentMethod.Card, deliveryMethod?: DemoDeliveryMethod): DemoOrder {
    const existing = this.snapshot.orders.find(order => order.actor === actorId && order.request === request); if (existing) return existing;
    this.requireModule(DemoModuleId.Checkout);
    if (scenario === DemoScenario.Error) throw new Error('El pago simulado no respondió. Conservamos tu carrito; seleccioná pago aprobado y reintentá.');
    if (scenario === DemoScenario.Unknown || method === DemoPaymentMethod.Unknown || deliveryMethod === DemoDeliveryMethod.Unknown) throw new Error('Elegí un escenario, pago y entrega válidos.');
    const actor = this.actor(actorId); const address = actor.addresses.find(value => value.id === addressId);
    if ((!address && deliveryMethod !== DemoDeliveryMethod.Pickup) || !actor.cart.length) throw new Error('Agregá productos y seleccioná una dirección.');
    if (actor.cart.some(line => !this.product(line.sku).active)) throw new Error('Un producto del carrito está archivado. Revisá el carrito y quitalo antes de confirmar.');
    if (scenario === DemoScenario.NoStock || actor.cart.some(line => this.variantAvailable(line.sku, this.sellable(line.sku, line.variantId).id) < line.quantity)) throw new Error('El stock cambió. Revisá las cantidades de tu carrito.');
    if (actor.cart.some(line => line.variant === DemoProductVariant.Unknown)) throw new Error('El carrito contiene una variante no reconocida.');
    if (actor.cart.some(line => line.variant === DemoProductVariant.Case && this.product(line.sku).supportsCase !== true)) throw new Error('Una presentación dejó de estar disponible. Quitá el producto y seleccioná otra variante.');
    if (actor.cart.some(line => line.quotedUnit !== undefined && line.quotedUnit !== this.variantPrice(line.sku, this.sellable(line.sku, line.variantId).id))) throw new Error('El precio cambió. Actualizá el resumen del carrito y volvé a confirmar.');
    const lines = actor.cart.map(line => { const variant = this.sellable(line.sku, line.variantId); const unit = this.variantPrice(line.sku, variant.id); return { ...line, variantId: variant.id, name: `${this.product(line.sku).name} · ${variant.name}`, variantName: variant.name, attributes: variant.attributes.map(attribute => ({ ...attribute })), image: variant.images[0] ? { ...variant.images[0] } : undefined, originalUnit: variant.price, discountUnit: variant.price - unit, currency: DemoCurrency.ARS, unit }; });
    const approved = scenario === DemoScenario.Approved; const rejected = scenario === DemoScenario.Rejected;
    const order: DemoOrder = { id: `DEMO-${this.id()}`, actor: actorId, request, status: approved ? OrderStatus.Paid : rejected ? OrderStatus.Cancelled : OrderStatus.PendingPayment, payment: approved ? PaymentStatus.Approved : rejected ? PaymentStatus.Rejected : PaymentStatus.Pending, shipment: ShipmentStatus.Preparing, lines, total: lines.reduce((sum, line) => sum + line.unit * line.quantity, 0), address: address ? `${address.street} · ${address.city}` : 'Retiro en comercio de muestra', tracking: '', history: [`Pedido creado · ${this.now()}`, `Pago ${scenario.label.toLowerCase()} (simulado)`], returned: false };
    order.method = method;
    if (deliveryMethod) { order.delivery = { method: deliveryMethod, cost: deliveryMethod.cost, days: deliveryMethod === DemoDeliveryMethod.Home ? this.snapshot.settings.deliveryDays : deliveryMethod.days, destination: deliveryMethod === DemoDeliveryMethod.Pickup ? 'Comercio de muestra · Retiro con DNI y número de pedido' : `${address!.street} · ${address!.city} · CP ${address!.postal}` }; order.address = order.delivery.destination; order.total += order.delivery.cost; }
    if (!Number.isSafeInteger(order.total)) throw new Error('El importe supera el límite de precisión permitido. Revisá precios y cantidades.');
    const fulfillment = ensureFulfillment(order); fulfillment.recipient = `${actor.firstName} ${actor.lastName}`; fulfillment.phone = actor.phone;
    if (order.delivery?.method === DemoDeliveryMethod.Pickup) { order.address = `Retiro en ${fulfillment.store} · ${fulfillment.location} · ${fulfillment.hours}`; order.delivery.destination = order.address; }
    for (const line of lines) { if (approved) { this.stockLine(line, -line.quantity, 0); this.snapshot.movements.push({ id: `${order.id}-${line.variantId}`, sku: line.sku, variantId: line.variantId, delta: -line.quantity, reason: `Compra ${order.id}` }); } else if (!rejected) this.stockLine(line, 0, line.quantity); }
    this.snapshot.orders.push(order); actor.cart = []; this.commit(approved); return order;
  }
  resolvePayment(orderId: string, scenario: DemoScenario): void {
    const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no encontrado.');
    if (order.payment !== PaymentStatus.Pending) throw new Error('Este pago ya tiene un resultado definitivo.');
    if (order.method === DemoPaymentMethod.Unknown || order.delivery?.method === DemoDeliveryMethod.Unknown || order.lines.some(line => line.currency === DemoCurrency.Unknown)) throw new Error('El pedido contiene un método o moneda no reconocido.');
    if (scenario !== DemoScenario.Approved && scenario !== DemoScenario.Rejected) throw new Error('Elegí aprobado o rechazado.');
    for (const line of order.lines) { this.stockLine(line, scenario === DemoScenario.Approved ? -line.quantity : 0, -line.quantity); if (scenario === DemoScenario.Approved) this.snapshot.movements.push({ id: `${order.id}-${line.variantId}`, sku: line.sku, variantId: line.variantId, delta: -line.quantity, reason: `Pago ${order.id}` }); }
    order.payment = scenario === DemoScenario.Approved ? PaymentStatus.Approved : PaymentStatus.Rejected; order.status = scenario === DemoScenario.Approved ? OrderStatus.Paid : OrderStatus.Cancelled; order.history.push(order.payment.label); this.commit(scenario === DemoScenario.Approved);
  }
  cancelPayment(orderId: string): void {
    const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no encontrado.');
    if (order.payment === PaymentStatus.Cancelled) return;
    if (order.payment !== PaymentStatus.Pending) throw new Error('Solo un pago pendiente puede cancelarse.');
    for (const line of order.lines) this.stockLine(line, 0, -line.quantity);
    order.payment = PaymentStatus.Cancelled; order.status = OrderStatus.Cancelled; order.history.push(`Pago cancelado · reserva liberada · ${this.now()}`); this.commit();
  }
  reportIncident(orderId: string, reason: string): void { const order = this.snapshot.orders.find(value => value.id === orderId); if (!order || order.payment !== PaymentStatus.Approved || !reason.trim()) throw new Error('Indicá una incidencia para un pedido aprobado.'); const fulfillment = ensureFulfillment(order); if (fulfillment.incident !== DemoIncidentKind.None || fulfillment.phase === DemoFulfillmentPhase.Unknown || order.delivery?.method === DemoDeliveryMethod.Unknown) throw new Error('Resolvé la incidencia pendiente antes de abrir otra.'); fulfillment.incident = DemoIncidentKind.Report; fulfillment.incidentText = reason.trim(); order.incident = reason.trim(); order.history.push(`Incidencia: ${order.incident} · ${this.now()}`); this.commit(); }
  resolveIncident(orderId: string, note: string): void { const order = this.snapshot.orders.find(value => value.id === orderId); if (!order?.incident || ensureFulfillment(order).incident !== DemoIncidentKind.Report) throw new Error('Coordiná el nuevo intento o plazo desde seguimiento.'); if (!note.trim()) throw new Error('Escribí una respuesta al comprador antes de resolver la consulta.'); const fulfillment = ensureFulfillment(order); fulfillment.incident = DemoIncidentKind.None; fulfillment.incidentText = ''; fulfillment.resolution = note.trim(); order.incident = ''; order.history.push(`Incidencia resuelta · ${note.trim()} · ${this.now()}`); this.commit(); }
  configureFulfillment(orderId: string, draft: DemoFulfillment): void { const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no disponible.'); new DemoFulfillmentPolicy().configure(order, draft); order.history.push(`Datos de entrega actualizados · ${this.now()}`); this.commit(); }
  fulfill(orderId: string, action: DemoFulfillmentAction, note = '', pickupDeadline?: string): void { this.requireModule(DemoModuleId.Shipping); const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no disponible.'); const event = new DemoFulfillmentPolicy().apply(order, action, note, pickupDeadline); if (!event) return; if (action === DemoFulfillmentAction.Dispatch) order.tracking = `${this.snapshot.settings.trackingPrefix}-${order.id}`; order.history.push(`${event} · ${this.now()}`); this.commit(); }
  advance(orderId: string): void { const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no disponible.'); const action = new DemoFulfillmentPolicy().actions(order)[0]; if (!action) throw new Error('La entrega no puede avanzar.'); this.fulfill(orderId, action); }
  adjust(sku: string, delta: number, reason: string, variantId?: string): void { if (!Number.isInteger(delta) || !reason.trim()) throw new Error('Indicá unidades enteras y motivo; respetá las reservas.'); const variant = this.sellable(sku, variantId); this.stockLine({ sku, variantId: variant.id }, delta, 0); this.snapshot.movements.push({ id: this.id(), sku, variantId: variant.id, delta, reason }); this.commit(true); }
  mlSale(sku: string, operation: string, variantId?: string): void { this.requireModule(DemoModuleId.MercadoLibre); const market = ensureMarketplace(this.snapshot, this.now()); const mapping = market.mappings.find(value => value.sku === sku && (!variantId || value.variantId === variantId) && value.status.eligible); if (!market.account.canProcess || !mapping) throw new Error('Conectá la cuenta simulada y vinculá la variante.'); const existing = this.snapshot.movements.find(value => value.id === operation); if (existing) { if (existing.sku !== sku || existing.variantId !== mapping.variantId) throw new Error('La operación ya pertenece a otra variante.'); return; } if (this.variantAvailable(sku, mapping.variantId) < 1) throw new Error('Producto sin stock.'); this.stockLine({ sku, variantId: mapping.variantId }, -1, 0); this.snapshot.movements.push({ id: operation, sku, variantId: mapping.variantId, delta: -1, reason: 'Venta Mercado Libre simulada' }); this.commit(true); }
  processStock(fail = false): void {
    this.requireModule(DemoModuleId.MercadoLibre); new DemoMarketplaceProcessor().process(this.snapshot, this.now(), fail);
    this.snapshot.syncJobs = ensureMarketplace(this.snapshot).queue.map(job => ({ id: job.id, sku: this.snapshot.marketplace!.mappings.find(mapping => mapping.id === job.mappingId)!.sku, desired: job.desired, status: job.status, created: job.created }));
    this.commit();
  }
  setMLAccount(status: DemoMLAccountStatus): void { this.requireModule(DemoModuleId.MercadoLibre); const market = ensureMarketplace(this.snapshot, this.now()); if (status === DemoMLAccountStatus.Unknown || market.account === DemoMLAccountStatus.Unknown) throw new Error('Cuenta desconocida; restablecé la demostración.'); market.account = status; market.accountAt = this.now(); new DemoMarketplaceProjection().refresh(this.snapshot, this.now()); this.commit(); }
  mapML(sku: string, variantId: string, listingId: string, variationId: string): void { this.requireModule(DemoModuleId.MercadoLibre); new DemoMarketplaceMapping().save(this.snapshot, sku, variantId, listingId, variationId, this.now()); if (!this.snapshot.listings.some(value => value.sku === sku)) this.snapshot.listings.push({ sku, linked: true, observed: 0, error: false }); new DemoMarketplaceProjection().refresh(this.snapshot, this.now()); this.commit(); }
  unlinkML(id: string): void { this.requireModule(DemoModuleId.MercadoLibre); new DemoMarketplaceMapping().unlink(this.snapshot, id); new DemoMarketplaceProjection().refresh(this.snapshot, this.now()); this.commit(); }
  remove(actorId: string, sku: string, variantId?: string): void { const actor = this.actor(actorId); const remaining = actor.cart.filter(line => variantId ? line.variantId !== variantId : line.sku !== sku); if (remaining.length === actor.cart.length) return; actor.cart = remaining; this.commit(); }
  watchCompetitor(name: string, sku: string, threshold: number): void { this.product(sku); if (!name.trim() || !Number.isInteger(threshold) || threshold < 1 || threshold > 100) throw new Error('Indicá nombre, producto y umbral entre 1 y 100%.'); this.snapshot.competitors.push({ id: this.id(), name: name.trim(), sku, threshold, enabled: true, price: this.price(sku), history: [this.price(sku)], unread: false }); this.commit(); }
  competitorPrice(id: string, price: number, operation = this.id()): void { new DemoCompetitorObservationStep().apply(this.snapshot, id, price, operation, this.now()); this.commit(); }
  saveSettings(settings: DemoSettings): void { if (![settings.homepageItems, settings.lowStockThreshold, settings.deliveryDays, settings.mlRows].every(value => Number.isInteger(value) && value >= 1 && value <= 30) || !/^[A-Z0-9-]{2,12}$/.test(settings.trackingPrefix)) throw new Error('Indicá valores enteros de 1 a 30 y un prefijo de seguimiento de 2–12 letras/números.'); this.snapshot.settings = { ...settings }; this.commit(); }
  saveProduct(product: DemoProduct, editingSku?: string): void {
    this.requireModule(DemoModuleId.Catalog);
    const existing = this.snapshot.products.find(value => value.sku === (editingSku ?? product.sku));
    if (!editingSku && existing) throw new Error('El SKU ya existe. Editá el producto existente.');
    if (editingSku && (!existing || product.sku !== editingSku)) throw new Error('No se puede cambiar el SKU de un producto existente.');
    const reserved = existing?.reserved ?? 0;
    if (!product.name.trim() || !product.sku.trim() || !Number.isSafeInteger(product.price) || product.price <= 0 || !Number.isInteger(product.onHand) || product.onHand < reserved) throw new Error('Revisá nombre, SKU, precio y stock; respetá las reservas existentes.');
    const next = structuredClone(product); initializeProductVariants(next); validateVariants(next.variants!); validateMedia(next.images ?? []);
    const otherIds = new Set(this.snapshot.products.filter(value => value.sku !== editingSku).flatMap(value => this.variants(value.sku).map(variant => variant.id)));
    if (next.variants!.some(variant => otherIds.has(variant.id))) throw new Error('La identidad de una variante ya pertenece a otro producto.');
    if (!next.description.trim() || !next.brand.trim() || !next.category.trim()) throw new Error('Completá descripción, marca y categoría.');
    if (existing) for (const previous of this.variants(existing.sku)) { const current = next.variants!.find(value => value.id === previous.id); if (!current || current.reserved !== previous.reserved || current.onHand < previous.reserved) throw new Error('Conservá las variantes existentes y sus reservas; podés archivarlas.'); }
    const stockChanges = next.variants!.map(variant => ({ variantId: variant.id, delta: variant.onHand - (existing?.variants?.find(previous => previous.id === variant.id)?.onHand ?? 0) })).filter(change => change.delta !== 0);
    for (const change of stockChanges) this.snapshot.movements.push({ id: `${this.id()}-${change.variantId}`, sku: next.sku, ...change, reason: existing ? 'Edición de inventario desde catálogo' : 'Alta de variante y stock inicial' });
    if (existing) Object.assign(existing, next); else this.snapshot.products.push(next);
    this.projectProduct(next.sku);
    this.commit(true);
  }
  saveCampaign(campaign: DemoCampaign): void { this.requireModule(DemoModuleId.Catalog); if (!campaign.title.trim() || !this.snapshot.products.some(value => value.sku === campaign.sku) || campaign.percent <= 0 || campaign.percent > 70 || campaign.from > campaign.until) throw new Error('Revisá el título, producto, descuento (1–70%) y vigencia.'); const index = this.snapshot.campaigns.findIndex(value => value.id === campaign.id); if (index < 0) this.snapshot.campaigns.push({ ...campaign }); else this.snapshot.campaigns[index] = { ...campaign }; this.commit(); }
  touch(): void { this.commit(); }
  requestReturn(actorId: string, orderId: string, command: string, selections: DemoReturnSelection[]): DemoReturnRequest {
    const order = this.snapshot.orders.find(value => value.id === orderId && value.actor === actorId);
    if (!order || order.payment !== PaymentStatus.Approved || order.shipment !== ShipmentStatus.Delivered) throw new Error('La devolución requiere un pedido propio, pagado y entregado.');
    const repeated = order.returns?.find(value => value.command === command);
    if (repeated) {
      if (repeated.lines.length !== selections.length || !repeated.lines.every(line => selections.some(value => value.variantId === line.variantId && value.quantity === line.quantity && value.reason === line.reason))) throw new Error('Esta operación ya existe con otros datos.');
      return repeated;
    }
    if (!command || !selections.length || new Set(selections.map(value => value.variantId)).size !== selections.length || selections.some(value => !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > new DemoReturnPolicy().available(order, value.variantId) || value.reason === DemoReturnReason.Unknown || !DemoReturnReason.all.includes(value.reason))) throw new Error('Seleccioná productos, cantidades disponibles y un motivo por producto.');
    if ((order.returns ?? []).some(value => value.status === DemoReturnStatus.Unknown || value.status === DemoReturnStatus.Legacy)) throw new Error('La devolución histórica necesita conciliación antes de continuar.');
    const request: DemoReturnRequest = { id: this.id(), command, created: this.now(), note: '', status: DemoReturnStatus.Requested, lines: selections.map(selection => { const line = order.lines.find(value => value.variantId === selection.variantId)!; const prior = line.quantity - new DemoReturnPolicy().available(order, selection.variantId); return { ...selection, name: line.name, refund: new DemoRefundAllocation().amount(line.unit * line.quantity, line.quantity, prior, selection.quantity), disposition: DemoReturnDisposition.Unknown }; }) };
    (order.returns ??= []).push(request); this.postSaleEvent(order, request, 'Solicitud de devolución enviada'); return request;
  }
  decideReturn(orderId: string, returnId: string, approve: boolean, note: string): void {
    const { order, request } = this.returnRequest(orderId, returnId);
    if (new DemoReturnDecision().apply(request, approve, note)) this.postSaleEvent(order, request, `${request.status.label}: ${request.note}`);
  }
  cancelReturn(actorId: string, orderId: string, returnId: string): void { const { order, request } = this.returnRequest(orderId, returnId); if (order.actor !== actorId) throw new Error('Sólo el comprador del pedido puede cancelar su solicitud.'); if (request.status === DemoReturnStatus.Cancelled) return; if (request.status !== DemoReturnStatus.Requested) throw new Error('La solicitud ya fue procesada; no se puede cancelar.'); request.status = DemoReturnStatus.Cancelled; this.postSaleEvent(order, request, request.status.label); }
  inspectReturn(orderId: string, returnId: string, outcomes: { variantId: string; disposition: DemoReturnDisposition }[]): void {
    const { order, request } = this.returnRequest(orderId, returnId);
    // Validate all variants before any mutation so a missing/invalid catalog cannot partially restock.
    for (const line of request.lines) { const bought = order.lines.find(value => value.variantId === line.variantId)!; this.sellable(bought.sku, line.variantId); }
    if (!new DemoReturnInspection().apply(request, outcomes)) return;
    for (const line of request.lines.filter(value => value.disposition.restock)) { const bought = order.lines.find(value => value.variantId === line.variantId)!; this.stockLine(bought, line.quantity, 0); this.snapshot.movements.push({ id: `return-${request.id}-${line.variantId}`, sku: bought.sku, variantId: line.variantId, delta: line.quantity, reason: `Inspección apta ${order.id}` }); }
    this.postSaleEvent(order, request, `Inspección registrada: ${request.lines.map(line => `${line.name} × ${line.quantity} · ${line.disposition.label}`).join('; ')}`, true);
  }
  refundReturn(orderId: string, returnId: string): void { const { order, request } = this.returnRequest(orderId, returnId); if (new DemoReturnRefund().apply(order, request)) this.postSaleEvent(order, request, `Reembolso simulado ${request.refundId} · ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(request.lines.reduce((sum, line) => sum + line.refund, 0) / 100)}`); }
  private returnRequest(orderId: string, returnId: string): { order: DemoOrder; request: DemoReturnRequest } { const order = this.snapshot.orders.find(value => value.id === orderId); const request = order?.returns?.find(value => value.id === returnId); if (!order || !request || order.payment !== PaymentStatus.Approved || request.status === DemoReturnStatus.Unknown || request.status === DemoReturnStatus.Legacy || request.lines.some(line => line.reason === DemoReturnReason.Unknown)) throw new Error('Devolución no disponible.'); return { order, request }; }
  private postSaleEvent(order: DemoOrder, request: DemoReturnRequest, text: string, stock = false): void { const created = this.now(); order.history.push(`${text} · ${created}`); this.snapshot.postSaleAlerts ??= []; this.snapshot.postSaleAlerts.push({ id: `${request.id}-${request.status.wire}`, orderId: order.id, actor: order.actor, text, created }); this.snapshot.version = 4; this.commit(stock); }
}

/** Single persistence boundary rehydrates canonical closed statuses and checks stock invariants. */
export function decodeSnapshot(raw: string): DemoSnapshot {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Snapshot inválido.');
  const state = parsed as DemoSnapshot;
  if (state.version === 5 && !state.marketplace) throw new Error('Falta el canal de muestra en la demo guardada. Restablecé sus datos.');
  if (![1, 2, 3, 4, 5].includes(state.version) || !Number.isInteger(state.revision) || !Array.isArray(state.products) || !Array.isArray(state.actors) || !Array.isArray(state.orders) || !Array.isArray(state.campaigns) || !Array.isArray(state.listings) || !Array.isArray(state.movements) || !Array.isArray(state.modules) || !Array.isArray(state.competitors)) throw new Error('La demo guardada tiene otra versión. Restablecé sus datos.');
  if (state.products.some(value => !value.sku || !Number.isSafeInteger(value.price) || value.price <= 0 || !Number.isInteger(value.onHand) || !Number.isInteger(value.reserved) || value.reserved < 0 || value.onHand < value.reserved)) throw new Error('Stock o precios inválidos. Restablecé la demostración.');
  const skus = new Set(state.products.map(product => product.sku));
  if (skus.size !== state.products.length || !state.actors.some(actor => actor.id === 'cliente') || state.actors.some(actor => !actor.id || typeof actor.email !== 'string' || typeof actor.firstName !== 'string' || !Array.isArray(actor.addresses) || !Array.isArray(actor.cart) || !Array.isArray(actor.favorites) || actor.cart.some(line => !skus.has(line.sku) || !Number.isInteger(line.quantity) || line.quantity < 1) || actor.addresses.some(address => !address.id || typeof address.street !== 'string' || typeof address.city !== 'string' || typeof address.postal !== 'string'))) throw new Error('La identidad o el carrito demo guardado son inválidos. Restablecé la demostración.');
  if (state.orders.some(order => !order.id || !state.actors.some(actor => actor.id === order.actor) || !Array.isArray(order.lines) || !Array.isArray(order.history) || !Number.isSafeInteger(order.total) || order.total < 0 || order.lines.some(line => !skus.has(line.sku) || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.unit) || line.unit < 0))) throw new Error('El historial demo guardado es inválido. Restablecé la demostración.');
  if (state.version === 1) {
    for (const product of state.products) {
      initializeProductVariants(product);
      for (const variant of product.variants!) variant.reserved = 0;
      for (const order of state.orders.filter(value => value.payment?.wire === PaymentStatus.Pending.wire)) for (const line of order.lines.filter(value => value.sku === product.sku)) {
        const legacy = line.variant ? DemoProductVariant.fromWire(line.variant.wire) : DemoProductVariant.Standard;
        const variant = product.variants!.find(value => value.id === `${product.sku}:${legacy.wire}`);
        if (!variant) throw new Error('La presentación histórica no puede migrarse. Restablecé la demo.');
        variant.reserved += line.quantity;
      }
      const caseVariant = product.variants!.find(value => value.id === `${product.sku}:${DemoProductVariant.Case.wire}`);
      if (caseVariant) { product.variants![0].onHand += caseVariant.onHand; caseVariant.onHand = caseVariant.reserved; product.variants![0].onHand -= caseVariant.onHand; }
      if (product.variants!.reduce((sum, value) => sum + value.reserved, 0) !== product.reserved) throw new Error('Las reservas históricas no coinciden; restablecé la demo.');
    }
    for (const actor of state.actors) for (const line of actor.cart) {
      const legacy = line.variant ? DemoProductVariant.fromWire(line.variant.wire) : DemoProductVariant.Standard;
      const product = state.products.find(value => value.sku === line.sku)!;
      const variant = product.variants!.find(value => value.id === `${product.sku}:${legacy.wire}`);
      if (!variant) throw new Error('La presentación del carrito no puede migrarse. Restablecé la demo.');
      line.variantId = variant.id;
    }
    for (const order of state.orders) for (const line of order.lines) {
      const legacy = line.variant ? DemoProductVariant.fromWire(line.variant.wire) : DemoProductVariant.Standard;
      line.variantId = `${line.sku}:${legacy.wire}`; line.variantName = legacy.label; line.attributes = [{ name: 'Presentación histórica', value: legacy.label }]; line.originalUnit = line.unit; line.discountUnit = 0; line.currency = DemoCurrency.ARS;
      if (!state.products.find(value => value.sku === line.sku)?.variants?.some(value => value.id === line.variantId)) throw new Error('La variante histórica no puede migrarse. Restablecé la demo.');
    }
    state.version = 2;
  }
  const variantIds = new Set<string>();
  for (const product of state.products) { validateVariants(product.variants ?? []); validateMedia(product.images ?? []); for (const variant of product.variants!) { if (variantIds.has(variant.id)) throw new Error('Identidad de variante duplicada.'); variantIds.add(variant.id); } if (product.onHand !== product.variants!.reduce((sum, value) => sum + value.onHand, 0) || product.reserved !== product.variants!.reduce((sum, value) => sum + value.reserved, 0)) throw new Error('El stock agregado no coincide con sus variantes.'); }
  for (const actor of state.actors) { if (new Set(actor.cart.map(line => line.variantId)).size !== actor.cart.length || actor.cart.some(line => !state.products.find(product => product.sku === line.sku)?.variants?.some(variant => variant.id === line.variantId) || (line.quotedUnit !== undefined && (!Number.isSafeInteger(line.quotedUnit) || line.quotedUnit < 0)))) throw new Error('Las variantes del carrito guardado son inválidas.'); }
  for (const order of state.orders) { if (new Set(order.lines.map(line => line.variantId)).size !== order.lines.length || order.lines.some(line => !state.products.find(product => product.sku === line.sku)?.variants?.some(variant => variant.id === line.variantId) || typeof line.variantName !== 'string' || !Array.isArray(line.attributes) || line.attributes.some(attribute => !attribute || typeof attribute.name !== 'string' || typeof attribute.value !== 'string') || !Number.isSafeInteger(line.originalUnit) || !Number.isSafeInteger(line.discountUnit) || line.discountUnit! < 0 || line.originalUnit! - line.discountUnit! !== line.unit)) throw new Error('Las variantes históricas del pedido guardado son inválidas.'); for (const line of order.lines) if (line.image) validateMedia([line.image]); }
  state.orders = state.orders.map(order => ({ ...order, status: OrderStatus.fromWire(order.status?.wire), payment: PaymentStatus.fromWire(order.payment?.wire), shipment: ShipmentStatus.fromWire(order.shipment?.wire), method: order.method ? DemoPaymentMethod.fromWire(order.method.wire) : DemoPaymentMethod.Card, delivery: order.delivery ? { ...order.delivery, method: DemoDeliveryMethod.fromWire(order.delivery.method?.wire) } : undefined, lines: order.lines.map(line => ({ ...line, currency: DemoCurrency.fromWire(line.currency?.wire) })) }));
  state.syncJobs = (state.syncJobs ?? []).map(job => ({ ...job, status: DemoSyncStatus.fromWire(job.status?.wire) }));
  if (state.syncJobs.some(job => !skus.has(job.sku) || !Number.isInteger(job.desired) || job.desired < 0) || state.orders.some(order => order.delivery && (!Number.isSafeInteger(order.delivery.cost) || order.delivery.cost < 0 || !Number.isInteger(order.delivery.days) || order.delivery.days < 1 || typeof order.delivery.destination !== 'string')) || state.competitors.some(value => !value.id || typeof value.name !== 'string' || !Number.isSafeInteger(value.price) || value.price < 100 || !Array.isArray(value.history))) throw new Error('Los procesos demo guardados son inválidos. Restablecé la demostración.');
  state.orders = state.orders.map(order => ({ ...order, lines: order.lines.map(line => ({ ...line, variant: line.variant ? DemoProductVariant.fromWire(line.variant.wire) : DemoProductVariant.Standard })) }));
  state.actors = state.actors.map(actor => ({ ...actor, cart: actor.cart.map(line => ({ ...line, variant: line.variant ? DemoProductVariant.fromWire(line.variant.wire) : DemoProductVariant.Standard })) }));
  state.modules = state.modules.map(module => ({ ...module, id: DemoModuleId.fromWire(typeof module.id === 'string' ? module.id : module.id?.wire) }));
  state.blocks ??= demoSeed().blocks;
  state.settings ??= demoSeed().settings;
  if (!Array.isArray(state.blocks) || state.blocks.some(block => typeof block.id !== 'string' || typeof block.title !== 'string' || typeof block.body !== 'string') || ![state.settings.homepageItems, state.settings.lowStockThreshold, state.settings.deliveryDays, state.settings.mlRows].every(value => Number.isInteger(value) && value >= 1 && value <= 30) || !/^[A-Z0-9-]{2,12}$/.test(state.settings.trackingPrefix)) throw new Error('La configuración demo guardada es inválida. Restablecé la demostración.');
  for (const order of state.orders) decodePostSale(order);
  state.postSaleAlerts ??= [];
  if (!Array.isArray(state.postSaleAlerts) || state.postSaleAlerts.some(value => !value.id || !state.orders.some(order => order.id === value.orderId && order.actor === value.actor) || typeof value.text !== 'string' || typeof value.created !== 'string') || new Set(state.postSaleAlerts.map(value => value.id)).size !== state.postSaleAlerts.length) throw new Error('Las alertas de postventa guardadas son inválidas.');
  for (const order of state.orders) decodeFulfillment(order);
  decodeInbox(state);
  decodeMarketplace(state);
  state.version = 5;
  return state;
}
