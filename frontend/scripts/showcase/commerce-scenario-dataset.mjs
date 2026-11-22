import { createHash } from 'node:crypto';

const closedToken = Symbol('showcase-commerce-closed-type');
class ClosedWireType {
  constructor(token, wire) {
    if (token !== closedToken) throw new TypeError('Closed wire type');
    this.wire = wire;
  }
}
export class CommerceScenarioKind extends ClosedWireType {
  static PendingPayment = new CommerceScenarioKind(closedToken, 'PENDING_PAYMENT');
  static PaidAwaitingPreparation = new CommerceScenarioKind(closedToken, 'PAID_AWAITING_PREPARATION');
  static Preparing = new CommerceScenarioKind(closedToken, 'PREPARING');
  static Shipped = new CommerceScenarioKind(closedToken, 'SHIPPED');
  static Delivered = new CommerceScenarioKind(closedToken, 'DELIVERED');
  static ReadyForPickup = new CommerceScenarioKind(closedToken, 'READY_FOR_PICKUP');
  static PickedUp = new CommerceScenarioKind(closedToken, 'PICKED_UP');
  static ReturnReceived = new CommerceScenarioKind(closedToken, 'RETURN_RECEIVED');
  static ReturnClosedMixed = new CommerceScenarioKind(closedToken, 'RETURN_CLOSED_MIXED');
  static Unknown = new CommerceScenarioKind(closedToken, 'UNKNOWN');
  static all = Object.freeze([this.PendingPayment, this.PaidAwaitingPreparation, this.Preparing, this.Shipped, this.Delivered,
    this.ReadyForPickup, this.PickedUp, this.ReturnReceived, this.ReturnClosedMixed]);
  static fromWire(value) { return this.all.find(candidate => candidate.wire === value) ?? this.Unknown; }
}
export class CommerceDeliveryMode extends ClosedWireType {
  static LocalDelivery = new CommerceDeliveryMode(closedToken, 'LOCAL_DELIVERY');
  static Pickup = new CommerceDeliveryMode(closedToken, 'PICKUP');
  static Unknown = new CommerceDeliveryMode(closedToken, 'UNKNOWN');
  static all = Object.freeze([this.LocalDelivery, this.Pickup]);
  static fromWire(value) { return this.all.find(candidate => candidate.wire === value) ?? this.Unknown; }
}
export class CommerceShipmentCommand extends ClosedWireType {
  static Preparing = new CommerceShipmentCommand(closedToken, 'PREPARING');
  static Shipped = new CommerceShipmentCommand(closedToken, 'SHIPPED');
  static Delivered = new CommerceShipmentCommand(closedToken, 'DELIVERED');
  static ReadyForPickup = new CommerceShipmentCommand(closedToken, 'READY_FOR_PICKUP');
  static PickedUp = new CommerceShipmentCommand(closedToken, 'PICKED_UP');
  static Unknown = new CommerceShipmentCommand(closedToken, 'UNKNOWN');
  static all = Object.freeze([this.Preparing, this.Shipped, this.Delivered, this.ReadyForPickup, this.PickedUp]);
  static fromWire(value) { return this.all.find(candidate => candidate.wire === value) ?? this.Unknown; }
}

const namespace = 'ferreteria-falcon-commerce-v1';
export function stableUuid(key) {
  const hex = createHash('sha256').update(`${namespace}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function path(...commands) { return Object.freeze(commands); }
const blueprints = Object.freeze([
  [CommerceScenarioKind.PendingPayment, CommerceDeliveryMode.LocalDelivery, path(), false, false, 2],
  [CommerceScenarioKind.PaidAwaitingPreparation, CommerceDeliveryMode.LocalDelivery, path(), false, false, 2],
  [CommerceScenarioKind.Preparing, CommerceDeliveryMode.LocalDelivery, path(CommerceShipmentCommand.Preparing), false, false, 2],
  [CommerceScenarioKind.Shipped, CommerceDeliveryMode.LocalDelivery, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.Shipped), false, false, 2],
  [CommerceScenarioKind.Delivered, CommerceDeliveryMode.LocalDelivery, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.Shipped, CommerceShipmentCommand.Delivered), false, false, 2],
  [CommerceScenarioKind.ReadyForPickup, CommerceDeliveryMode.Pickup, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.ReadyForPickup), false, false, 2],
  [CommerceScenarioKind.PickedUp, CommerceDeliveryMode.Pickup, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.ReadyForPickup, CommerceShipmentCommand.PickedUp), false, false, 2],
  [CommerceScenarioKind.ReturnReceived, CommerceDeliveryMode.LocalDelivery, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.Shipped, CommerceShipmentCommand.Delivered), true, false, 2],
  [CommerceScenarioKind.ReturnClosedMixed, CommerceDeliveryMode.LocalDelivery, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.Shipped, CommerceShipmentCommand.Delivered), true, true, 3],
]);

export function commerceScenarioDataset(products) {
  if (!Array.isArray(products)) throw new TypeError('Commerce scenarios require products');
  const candidates = products.filter(product => typeof product?.sku === 'string' && Number.isSafeInteger(product.stock) && product.stock >= 5 && Number.isFinite(product.price) && product.price > 0);
  if (candidates.length < blueprints.length) throw new Error('Commerce scenarios require nine saleable products');
  return Object.freeze(blueprints.map(([kind, deliveryMode, shipmentPath, receiveReturn, closeMixedReturn, quantity], index) => Object.freeze({
    key: kind.wire.toLowerCase().replaceAll('_', '-'),
    kind,
    deliveryMode,
    shipmentPath,
    receiveReturn,
    closeMixedReturn,
    quantity,
    sku: candidates[index].sku,
    unitPrice: String(candidates[index].price),
    idempotencyKey: stableUuid(`checkout:${kind.wire}`),
    webhookEventId: stableUuid(`webhook-event:${kind.wire}`),
    webhookRequestId: stableUuid(`webhook-request:${kind.wire}`),
    dispositionKey: stableUuid(`return-disposition:${kind.wire}`),
  })));
}

Object.freeze(CommerceScenarioKind.prototype);
Object.freeze(CommerceDeliveryMode.prototype);
Object.freeze(CommerceShipmentCommand.prototype);
