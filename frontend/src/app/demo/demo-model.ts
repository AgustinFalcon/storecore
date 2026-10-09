import { OrderStatus } from '../domain/order/order-status';
import { PaymentStatus } from '../domain/order/payment-status';
import { ShipmentStatus } from '../domain/order/shipment-status';

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
export interface DemoProduct { sku: string; name: string; category: string; brand: string; description: string; price: number; original: number; onHand: number; reserved: number; active: boolean; tone: string; variant: string; }
export interface DemoAddress { id: string; label: string; street: string; city: string; postal: string; primary: boolean; }
export interface DemoActor { id: string; email: string; firstName: string; lastName: string; phone: string; addresses: DemoAddress[]; favorites: string[]; cart: { sku: string; quantity: number }[]; }
export interface DemoOrder { id: string; actor: string; request: string; status: OrderStatus; payment: PaymentStatus; shipment: ShipmentStatus; lines: { sku: string; name: string; quantity: number; unit: number }[]; total: number; address: string; tracking: string; history: string[]; returned: boolean; }
export interface DemoCampaign { id: string; title: string; sku: string; percent: number; active: boolean; from: string; until: string; }
export interface DemoListing { sku: string; linked: boolean; observed: number; error: boolean; }
export interface DemoMovement { id: string; sku: string; delta: number; reason: string; }
export interface DemoSnapshot { version: number; revision: number; products: DemoProduct[]; actors: DemoActor[]; orders: DemoOrder[]; campaigns: DemoCampaign[]; listings: DemoListing[]; movements: DemoMovement[]; title: string; subtitle: string; modules: { id: string; enabled: boolean }[]; competitors: { id: string; name: string; price: number; history: number[]; unread: boolean }[]; mlConnected: boolean; }

const NAMES = ['Taladro inalámbrico 20 V', 'Amoladora angular 115 mm', 'Kit de herramientas 108 piezas', 'Atornillador compacto', 'Sierra circular profesional', 'Lijadora orbital', 'Guantes de trabajo', 'Anteojos de protección', 'Casco de seguridad', 'Organizador modular', 'Caja de herramientas', 'Cinta métrica 8 m'];
export function demoSeed(): DemoSnapshot {
  const products = NAMES.map((name, index): DemoProduct => ({ sku: `DEMO-${String(index + 1).padStart(3, '0')}`, name, category: ['Herramientas', 'Seguridad', 'Organización'][Math.floor(index / 6) === 0 ? 0 : index < 9 ? 1 : 2], brand: ['Norte', 'Avance', 'Taller'][index % 3], description: 'Diseñado para trabajar con precisión y comodidad. Calidad durable, garantía de 12 meses y asistencia personalizada. Incluye accesorios y manual de uso.', price: (12500 + index * 8500) * 100, original: (14500 + index * 8500) * 100, onHand: index === 5 ? 0 : index === 8 ? 2 : 18 + index, reserved: 0, active: true, tone: ['#e6a63f', '#667b94', '#a5b49b'][index % 3], variant: 'Estándar' }));
  const actor = (id: string, firstName: string): DemoActor => ({ id, email: `${id}@demo.invalid`, firstName, lastName: 'Demo', phone: '011 5555 0100', addresses: [{ id: `address-${id}`, label: 'Casa', street: 'Avenida de muestra 123', city: 'Buenos Aires', postal: '1406', primary: true }], favorites: [products[0].sku, products[2].sku], cart: [] });
  const orders: DemoOrder[] = [ShipmentStatus.Preparing, ShipmentStatus.Shipped, ShipmentStatus.Delivered].map((shipment, index) => ({ id: `DEMO-10${index}`, actor: index === 2 ? 'cliente2' : 'cliente', request: `seed-${index}`, status: OrderStatus.Paid, payment: PaymentStatus.Approved, shipment, lines: [{ sku: products[index].sku, name: products[index].name, quantity: 1, unit: products[index].price }], total: products[index].price, address: 'Avenida de muestra 123 · Buenos Aires', tracking: shipment === ShipmentStatus.Preparing ? '' : `SIM-000${index}`, history: ['Pedido creado · 08/10/2026', 'Pago aprobado (simulado)', shipment.label], returned: false }));
  return { version: 1, revision: 0, products, actors: [actor('cliente', 'Alex'), actor('cliente2', 'Sam')], orders, campaigns: [{ id: 'offer-1', title: 'Equipá tu taller', sku: products[0].sku, percent: 10, active: true, from: '2026-01-01', until: '2027-12-31' }], listings: products.slice(0, 4).map(product => ({ sku: product.sku, linked: true, observed: product.onHand, error: false })), movements: [], title: 'Todo para tu próximo proyecto', subtitle: 'Herramientas, seguridad y organización. Elegí calidad, comprá con confianza.', modules: ['Catálogo', 'Checkout', 'Envíos', 'Mercado Libre'].map(id => ({ id, enabled: true })), competitors: [{ id: 'competitor-1', name: 'Comercio de muestra A', price: products[0].price + 50000, history: [products[0].price + 80000, products[0].price + 50000], unread: false }], mlConnected: false };
}

/** All financial amounts are integer minor units; this coordinator is framework-free. */
export class DemoCommerce {
  constructor(public snapshot: DemoSnapshot = demoSeed(), private readonly now: () => string = () => new Date().toISOString(), private readonly id: () => string = () => crypto.randomUUID()) {}
  private commit(): void { this.snapshot.revision++; }
  actor(id: string): DemoActor { const actor = this.snapshot.actors.find(value => value.id === id); if (!actor) throw new Error('Elegí una identidad de demostración.'); return actor; }
  product(sku: string): DemoProduct { const product = this.snapshot.products.find(value => value.sku === sku); if (!product) throw new Error('Producto no encontrado.'); return product; }
  available(sku: string): number { const product = this.product(sku); return product.onHand - product.reserved; }
  price(sku: string): number { const product = this.product(sku); const offer = this.snapshot.campaigns.find(value => value.sku === sku && value.active && value.from <= this.now().slice(0, 10) && value.until >= this.now().slice(0, 10)); return offer ? Math.round(product.price * (100 - offer.percent) / 100) : product.price; }
  setQuantity(actorId: string, sku: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > this.available(sku)) throw new Error('La cantidad supera el stock disponible.');
    const actor = this.actor(actorId); const existing = actor.cart.find(line => line.sku === sku);
    if (quantity === 0) actor.cart = actor.cart.filter(line => line.sku !== sku); else if (existing) existing.quantity = quantity; else actor.cart.push({ sku, quantity });
    this.commit();
  }
  add(actorId: string, sku: string, quantity: number): void { this.setQuantity(actorId, sku, (this.actor(actorId).cart.find(line => line.sku === sku)?.quantity ?? 0) + quantity); }
  favorite(actorId: string, sku: string): void { const actor = this.actor(actorId); actor.favorites = actor.favorites.includes(sku) ? actor.favorites.filter(value => value !== sku) : [...actor.favorites, sku]; this.commit(); }
  checkout(actorId: string, request: string, addressId: string, scenario: DemoScenario): DemoOrder {
    const existing = this.snapshot.orders.find(order => order.actor === actorId && order.request === request); if (existing) return existing;
    if (scenario === DemoScenario.Error) throw new Error('El pago simulado no respondió. Conservamos tu carrito; seleccioná pago aprobado y reintentá.');
    if (scenario === DemoScenario.Unknown) throw new Error('Elegí un escenario válido.');
    const actor = this.actor(actorId); const address = actor.addresses.find(value => value.id === addressId);
    if (!address || !actor.cart.length) throw new Error('Agregá productos y seleccioná una dirección.');
    if (scenario === DemoScenario.NoStock || actor.cart.some(line => this.available(line.sku) < line.quantity)) throw new Error('El stock cambió. Revisá las cantidades de tu carrito.');
    const lines = actor.cart.map(line => ({ ...line, name: this.product(line.sku).name, unit: this.price(line.sku) }));
    const approved = scenario === DemoScenario.Approved; const rejected = scenario === DemoScenario.Rejected;
    const order: DemoOrder = { id: `DEMO-${this.id()}`, actor: actorId, request, status: approved ? OrderStatus.Paid : rejected ? OrderStatus.Cancelled : OrderStatus.PendingPayment, payment: approved ? PaymentStatus.Approved : rejected ? PaymentStatus.Rejected : PaymentStatus.Pending, shipment: ShipmentStatus.Preparing, lines, total: lines.reduce((sum, line) => sum + line.unit * line.quantity, 0), address: `${address.street} · ${address.city}`, tracking: '', history: [`Pedido creado · ${this.now()}`, `Pago ${scenario.label.toLowerCase()} (simulado)`], returned: false };
    for (const line of lines) { const product = this.product(line.sku); if (approved) { product.onHand -= line.quantity; this.snapshot.movements.push({ id: `${order.id}-${line.sku}`, sku: line.sku, delta: -line.quantity, reason: `Compra ${order.id}` }); } else if (!rejected) product.reserved += line.quantity; }
    this.snapshot.orders.push(order); actor.cart = []; this.commit(); return order;
  }
  resolvePayment(orderId: string, scenario: DemoScenario): void {
    const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no encontrado.');
    if (order.payment !== PaymentStatus.Pending) throw new Error('Este pago ya tiene un resultado definitivo.');
    if (scenario !== DemoScenario.Approved && scenario !== DemoScenario.Rejected) throw new Error('Elegí aprobado o rechazado.');
    for (const line of order.lines) { const product = this.product(line.sku); product.reserved -= line.quantity; if (scenario === DemoScenario.Approved) { product.onHand -= line.quantity; this.snapshot.movements.push({ id: `${order.id}-${line.sku}`, sku: line.sku, delta: -line.quantity, reason: `Pago ${order.id}` }); } }
    order.payment = scenario === DemoScenario.Approved ? PaymentStatus.Approved : PaymentStatus.Rejected; order.status = scenario === DemoScenario.Approved ? OrderStatus.Paid : OrderStatus.Cancelled; order.history.push(order.payment.label); this.commit();
  }
  advance(orderId: string): void { const order = this.snapshot.orders.find(value => value.id === orderId); if (!order || order.payment !== PaymentStatus.Approved) throw new Error('El pedido necesita pago aprobado.'); if (order.shipment === ShipmentStatus.Preparing) { order.shipment = ShipmentStatus.Shipped; order.tracking = `SIM-${order.id}`; } else if (order.shipment === ShipmentStatus.Shipped) order.shipment = ShipmentStatus.Delivered; else throw new Error('La entrega ya está finalizada.'); order.history.push(`${order.shipment.label} · ${this.now()}`); this.commit(); }
  receiveReturn(orderId: string): void { const order = this.snapshot.orders.find(value => value.id === orderId); if (!order || order.shipment !== ShipmentStatus.Delivered || order.returned) throw new Error('La devolución no está disponible.'); order.returned = true; order.history.push('Devolución recibida; inspección pendiente. Sin reintegro automático de stock.'); this.commit(); }
  adjust(sku: string, delta: number, reason: string): void { const product = this.product(sku); if (!Number.isInteger(delta) || !reason.trim() || product.onHand + delta < product.reserved) throw new Error('Indicá unidades enteras y motivo; el stock no puede ser menor a las reservas.'); product.onHand += delta; this.snapshot.movements.push({ id: this.id(), sku, delta, reason }); this.commit(); }
  mlSale(sku: string, operation: string): void { if (!this.snapshot.mlConnected || !this.snapshot.listings.some(value => value.sku === sku && value.linked)) throw new Error('Conectá la cuenta simulada y vinculá el producto.'); if (this.snapshot.movements.some(value => value.id === operation)) return; if (this.available(sku) < 1) throw new Error('Producto sin stock.'); this.product(sku).onHand--; this.snapshot.movements.push({ id: operation, sku, delta: -1, reason: 'Venta Mercado Libre simulada' }); this.commit(); }
  saveProduct(product: DemoProduct): void { if (!product.name.trim() || !product.sku.trim() || !Number.isSafeInteger(product.price) || product.price <= 0 || !Number.isInteger(product.onHand) || product.onHand < product.reserved) throw new Error('Revisá nombre, SKU, precio y stock.'); const index = this.snapshot.products.findIndex(value => value.sku === product.sku); if (index < 0) this.snapshot.products.push({ ...product }); else this.snapshot.products[index] = { ...product }; this.commit(); }
  saveCampaign(campaign: DemoCampaign): void { if (!campaign.title.trim() || !this.snapshot.products.some(value => value.sku === campaign.sku) || campaign.percent <= 0 || campaign.percent > 70 || campaign.from > campaign.until) throw new Error('Revisá el título, producto, descuento (1–70%) y vigencia.'); const index = this.snapshot.campaigns.findIndex(value => value.id === campaign.id); if (index < 0) this.snapshot.campaigns.push({ ...campaign }); else this.snapshot.campaigns[index] = { ...campaign }; this.commit(); }
  touch(): void { this.commit(); }
}

/** Single persistence boundary rehydrates canonical closed statuses and checks stock invariants. */
export function decodeSnapshot(raw: string): DemoSnapshot {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Snapshot inválido.');
  const state = parsed as DemoSnapshot;
  if (state.version !== 1 || !Number.isInteger(state.revision) || !Array.isArray(state.products) || !Array.isArray(state.actors) || !Array.isArray(state.orders) || !Array.isArray(state.campaigns) || !Array.isArray(state.listings) || !Array.isArray(state.movements) || !Array.isArray(state.modules) || !Array.isArray(state.competitors)) throw new Error('La demo guardada tiene otra versión. Restablecé sus datos.');
  if (state.products.some(value => !value.sku || !Number.isSafeInteger(value.price) || value.price <= 0 || !Number.isInteger(value.onHand) || !Number.isInteger(value.reserved) || value.reserved < 0 || value.onHand < value.reserved)) throw new Error('Stock o precios inválidos. Restablecé la demostración.');
  state.orders = state.orders.map(order => ({ ...order, status: OrderStatus.fromWire(order.status?.wire), payment: PaymentStatus.fromWire(order.payment?.wire), shipment: ShipmentStatus.fromWire(order.shipment?.wire) }));
  return state;
}
