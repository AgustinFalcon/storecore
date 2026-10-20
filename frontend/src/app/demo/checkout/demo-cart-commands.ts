import { OrderStatus } from '../../domain/order/order-status';
import { PaymentStatus } from '../../domain/order/payment-status';
import { ShipmentStatus } from '../../domain/order/shipment-status';
import { DemoCatalogQuery } from '../catalog/demo-catalog-query';
import type { DemoActor, DemoOrder, DemoOrderLine, DemoCheckoutSnapshot } from './checkout-model';
import { DemoDeliveryMethod, DemoPaymentMethod } from '../demo-process-types';
import { DemoModuleId, DemoScenario } from '../demo-model';
import { DemoDeliveryPolicy } from './demo-delivery-policy';
import { DemoReservationState } from './demo-reservation-state';
import { DemoOrderReservations } from './demo-order-reservations';

export interface DemoCartCommandPort {
  readonly catalog: DemoCatalogQuery;
  snapshot(): DemoCheckoutSnapshot;
  actor(actorId: string): DemoActor;
  requireCustomerAccess(actorId: string): void;
  /** Validate the current session and its customer ownership or explicit administrative permission. */
  requirePaymentAccess(actorId: string, order: DemoOrder): void;
  requireModule(module: DemoModuleId): void;
  commit(projectStock?: boolean): void;
  now(): string;
  id(): string;
  paymentPending(order: DemoOrder): void;
  paymentResolved(order: DemoOrder): void;
}

/** Cart and checkout commands. The application coordinator only delegates to this use-case object. */
export class DemoCartCommands {
  constructor(private readonly port: DemoCartCommandPort) {}

  setQuantity(actorId: string, sku: string, variantId: string, quantity: number): void {
    this.port.requireCustomerAccess(actorId);
    this.port.catalog.variant(sku, variantId);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Ingresá una cantidad entera de al menos 1 unidad. Para quitar el producto usá Quitar.');
    if (quantity > this.port.catalog.available(sku, variantId)) throw new Error('La cantidad supera el stock disponible para esta variante.');
    const actor = this.port.actor(actorId);
    const existing = actor.cart.find(line => line.sku === sku && line.variantId === variantId);
    if (existing) existing.quantity = quantity;
    else actor.cart.push({ sku, variantId, quantity, quotedUnit: this.port.catalog.price(sku, variantId) });
    this.port.commit();
  }

  add(actorId: string, sku: string, quantity: number, variantId: string): void {
    this.port.requireCustomerAccess(actorId);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Ingresá una cantidad entera de al menos 1 unidad.');
    const product = this.port.catalog.product(sku);
    if (!product.publication.published) throw new Error('Este producto está archivado y no se puede comprar.');
    const selected = this.port.catalog.variant(sku, variantId);
    if (!selected.saleState.active || this.port.catalog.available(sku, variantId) < 1) throw new Error('La variante seleccionada no está disponible.');
    const existing = this.port.actor(actorId).cart.find(line => line.sku === sku && line.variantId === variantId);
    this.setQuantity(actorId, sku, variantId, (existing?.quantity ?? 0) + quantity);
  }

  remove(actorId: string, sku: string, variantId: string): void {
    this.port.requireCustomerAccess(actorId);
    if (typeof variantId !== 'string' || !variantId.trim()) throw new Error('Seleccioná una variante válida.');
    const actor = this.port.actor(actorId);
    const remaining = actor.cart.filter(line => line.sku !== sku || line.variantId !== variantId);
    if (remaining.length === actor.cart.length) return;
    actor.cart = remaining;
    this.port.commit();
  }

  needsReconfirmation(actorId: string): boolean {
    return this.port.actor(actorId).cart.some(line => {
      const product = this.port.catalog.product(line.sku);
      const variant = this.port.catalog.variant(line.sku, line.variantId);
      return !product.publication.published || !variant.saleState.active
        || line.quotedUnit !== this.port.catalog.price(line.sku, line.variantId)
        || this.port.catalog.available(line.sku, line.variantId) < line.quantity;
    });
  }

  confirmQuote(actorId: string): void {
    this.port.requireCustomerAccess(actorId);
    const cart = this.port.actor(actorId).cart;
    if (cart.some(line => !this.port.catalog.product(line.sku).publication.published || !this.port.catalog.variant(line.sku, line.variantId).saleState.active || this.port.catalog.available(line.sku, line.variantId) < line.quantity)) throw new Error('El stock o una variante cambió. Ajustá el carrito antes de confirmar el nuevo resumen.');
    cart.forEach(line => line.quotedUnit = this.port.catalog.price(line.sku, line.variantId));
    this.port.commit();
  }

  checkout(actorId: string, request: string, addressId: string, scenario: DemoScenario, method = DemoPaymentMethod.Card, deliveryMethod: DemoDeliveryMethod): DemoOrder {
    this.port.requireCustomerAccess(actorId);
    if (!DemoDeliveryMethod.all.includes(deliveryMethod)) throw new Error('Elegí una entrega válida antes de confirmar.');
    const snapshot = this.port.snapshot();
    const existing = snapshot.orders.find(order => order.actor === actorId && order.request === request);
    if (existing) return existing;
    this.port.requireModule(DemoModuleId.Checkout);
    if (scenario === DemoScenario.Error) throw new Error('El pago simulado no respondió. Conservamos tu carrito; seleccioná pago aprobado y reintentá.');
    if (scenario === DemoScenario.Unknown || method === DemoPaymentMethod.Unknown || deliveryMethod === DemoDeliveryMethod.Unknown) throw new Error('Elegí un escenario, pago y entrega válidos.');
    if (deliveryMethod === DemoDeliveryMethod.Home) this.port.requireModule(DemoModuleId.Shipping);
    const actor = this.port.actor(actorId);
    const address = actor.addresses.find(value => value.id === addressId);
    const pickupLocation = DemoDeliveryPolicy.pickupLocation(actor.cart, (sku, variantId) => this.port.catalog.variant(sku, variantId));
    if (deliveryMethod === DemoDeliveryMethod.Pickup && !pickupLocation) throw new Error('El retiro no está disponible para todos los productos seleccionados. Elegí envío a domicilio.');
    if ((!address && deliveryMethod !== DemoDeliveryMethod.Pickup) || !actor.cart.length) throw new Error('Agregá productos y seleccioná una dirección.');
    if (actor.cart.some(line => !this.port.catalog.product(line.sku).publication.published)) throw new Error('Un producto del carrito está archivado. Revisá el carrito y quitalo antes de confirmar.');
    if (scenario === DemoScenario.NoStock || actor.cart.some(line => this.port.catalog.available(line.sku, line.variantId) < line.quantity)) throw new Error('El stock cambió. Revisá las cantidades de tu carrito.');
    if (this.needsReconfirmation(actorId)) throw new Error('El precio o la disponibilidad cambió. Revisá y confirmá el nuevo resumen antes de pagar.');
    if (actor.cart.some(line => !this.port.catalog.variant(line.sku, line.variantId).saleState.active)) throw new Error('Una variante dejó de estar disponible. Quitá el producto y seleccioná otra variante.');
    const lines: DemoOrderLine[] = actor.cart.map(line => {
      const product = this.port.catalog.product(line.sku);
      const variant = this.port.catalog.variant(line.sku, line.variantId);
      return { sku: line.sku, variantId: variant.id, name: product.name, variantLabel: variant.label, attributes: variant.attributes.map(attribute => ({ ...attribute })), image: { ...(product.media[0] ?? { id: `${product.sku}-fallback`, src: '', alt: 'Imagen no disponible' }) }, quantity: line.quantity, unit: this.port.catalog.price(line.sku, variant.id) };
    });
    const approved = scenario === DemoScenario.Approved;
    const rejected = scenario === DemoScenario.Rejected;
    const order: DemoOrder = { id: `DEMO-${this.port.id()}`, actor: actorId, request, status: approved ? OrderStatus.Paid : rejected ? OrderStatus.Cancelled : OrderStatus.PendingPayment, payment: approved ? PaymentStatus.Approved : rejected ? PaymentStatus.Rejected : PaymentStatus.Pending, shipment: approved ? ShipmentStatus.Preparing : rejected ? ShipmentStatus.Cancelled : ShipmentStatus.Pending, lines, total: lines.reduce((sum, line) => sum + line.unit * line.quantity, 0), address: address ? `${address.street} · ${address.city}` : 'Retiro en comercio de muestra', tracking: '', history: [`Pedido creado · ${this.port.now()}`, `Pago ${scenario.label.toLowerCase()} (simulado)`] };
    order.method = method;
    order.reservation = { state: approved ? DemoReservationState.Consumed : rejected ? DemoReservationState.None : DemoReservationState.Held, lines: rejected ? [] : lines.map(line => ({ sku: line.sku, variantId: line.variantId, quantity: line.quantity })) };
    order.delivery = { method: deliveryMethod, cost: deliveryMethod.cost, days: deliveryMethod === DemoDeliveryMethod.Home ? snapshot.settings.deliveryDays : deliveryMethod.days, destination: deliveryMethod === DemoDeliveryMethod.Pickup ? pickupLocation! : `${address!.street} · ${address!.city} · CP ${address!.postal}` };
    order.address = order.delivery.destination;
    order.total += order.delivery.cost;
    for (const line of lines) {
      const product = this.port.catalog.product(line.sku);
      const variant = this.port.catalog.variant(line.sku, line.variantId);
      if (approved) {
        variant.onHand -= line.quantity;
        snapshot.movements.push({ id: `${order.id}-${line.sku}-${line.variantId}`, sku: line.sku, variantId: variant.id, delta: -line.quantity, reason: `Compra ${order.id} · ${variant.label}` });
      } else if (!rejected) variant.reserved += line.quantity;
      this.port.catalog.refreshTotals(product);
    }
    snapshot.orders.push(order);
    actor.cart = [];
    if (!approved && !rejected) this.port.paymentPending(order);
    this.port.commit(approved);
    return order;
  }

  resolvePayment(actorId: string, orderId: string, scenario: DemoScenario): void {
    const snapshot = this.port.snapshot();
    const order = snapshot.orders.find(value => value.id === orderId);
    if (!order) throw new Error('Pedido no encontrado.');
    this.port.requirePaymentAccess(actorId, order);
    if (order.payment !== PaymentStatus.Pending) throw new Error('Este pago ya tiene un resultado definitivo.');
    if (order.method === DemoPaymentMethod.Unknown || order.delivery?.method === DemoDeliveryMethod.Unknown) throw new Error('El pedido contiene un método no reconocido.');
    if (scenario !== DemoScenario.Approved && scenario !== DemoScenario.Rejected) throw new Error('Elegí aprobado o rechazado.');
    DemoOrderReservations.settle(order, snapshot, scenario === DemoScenario.Approved);
    for (const line of order.lines) {
      const product = this.port.catalog.product(line.sku);
      const variant = this.port.catalog.variant(line.sku, line.variantId);
      if (scenario === DemoScenario.Approved) {
        snapshot.movements.push({ id: `${order.id}-${line.sku}-${line.variantId}`, sku: line.sku, variantId: variant.id, delta: -line.quantity, reason: `Pago ${order.id} · ${variant.label}` });
      }
      this.port.catalog.refreshTotals(product);
    }
    order.payment = scenario === DemoScenario.Approved ? PaymentStatus.Approved : PaymentStatus.Rejected;
    order.status = scenario === DemoScenario.Approved ? OrderStatus.Paid : OrderStatus.Cancelled;
    order.shipment = scenario === DemoScenario.Approved ? ShipmentStatus.Preparing : ShipmentStatus.Cancelled;
    order.tracking = '';
    order.history.push(order.payment.label, order.shipment.label);
    this.port.paymentResolved(order);
    this.port.commit(scenario === DemoScenario.Approved);
  }

  cancelPayment(actorId: string, orderId: string): void {
    const snapshot = this.port.snapshot();
    const order = snapshot.orders.find(value => value.id === orderId);
    if (!order) throw new Error('Pedido no encontrado.');
    this.port.requirePaymentAccess(actorId, order);
    if (order.payment === PaymentStatus.Cancelled) return;
    if (order.payment !== PaymentStatus.Pending) throw new Error('Solo un pago pendiente puede cancelarse.');
    const reservation = order.reservation?.state ?? DemoReservationState.Unknown;
    DemoOrderReservations.settle(order, snapshot, false);
    order.payment = PaymentStatus.Cancelled;
    order.status = OrderStatus.Cancelled;
    order.shipment = ShipmentStatus.Cancelled;
    order.tracking = '';
    order.history.push(`${reservation.cancelSuccess} · ${this.port.now()}`);
    this.port.paymentResolved(order);
    this.port.commit();
  }
}
