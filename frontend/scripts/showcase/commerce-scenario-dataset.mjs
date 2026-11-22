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
export class CommercePaymentStatus extends ClosedWireType {
  static Pending = new CommercePaymentStatus(closedToken, 'PENDING');
  static Approved = new CommercePaymentStatus(closedToken, 'APPROVED');
  static Unknown = new CommercePaymentStatus(closedToken, 'UNKNOWN');
  static all = Object.freeze([this.Pending, this.Approved]);
  static fromWire(value) { return this.all.find(candidate => candidate.wire === value) ?? this.Unknown; }
}
export class CommerceShipmentStatus extends ClosedWireType {
  static Pending = new CommerceShipmentStatus(closedToken, 'PENDING');
  static Preparing = new CommerceShipmentStatus(closedToken, 'PREPARING');
  static Shipped = new CommerceShipmentStatus(closedToken, 'SHIPPED');
  static Delivered = new CommerceShipmentStatus(closedToken, 'DELIVERED');
  static ReadyForPickup = new CommerceShipmentStatus(closedToken, 'READY_FOR_PICKUP');
  static PickedUp = new CommerceShipmentStatus(closedToken, 'PICKED_UP');
  static Unknown = new CommerceShipmentStatus(closedToken, 'UNKNOWN');
  static all = Object.freeze([this.Pending, this.Preparing, this.Shipped, this.Delivered, this.ReadyForPickup, this.PickedUp]);
  static fromWire(value) { return this.all.find(candidate => candidate.wire === value) ?? this.Unknown; }
}
export class CommerceRmaStatus extends ClosedWireType {
  static None = new CommerceRmaStatus(closedToken, 'NONE');
  static ReturnReceived = new CommerceRmaStatus(closedToken, 'RETURN_RECEIVED');
  static Closed = new CommerceRmaStatus(closedToken, 'CLOSED');
  static Unknown = new CommerceRmaStatus(closedToken, 'UNKNOWN');
  static all = Object.freeze([this.None, this.ReturnReceived, this.Closed]);
  static fromWire(value) { return this.all.find(candidate => candidate.wire === value) ?? this.Unknown; }
}
export class CommerceDispositionState extends ClosedWireType {
  static Editable = new CommerceDispositionState(closedToken, 'EDITABLE');
  static Confirmed = new CommerceDispositionState(closedToken, 'CONFIRMED');
  static Unknown = new CommerceDispositionState(closedToken, 'UNKNOWN');
  static all = Object.freeze([this.Editable, this.Confirmed]);
  static fromWire(value) { return this.all.find(candidate => candidate.wire === value) ?? this.Unknown; }
}
export class CommerceReturnTarget extends ClosedWireType {
  static None = new CommerceReturnTarget(closedToken, 'NONE');
  static Received = new CommerceReturnTarget(closedToken, 'RECEIVED');
  static ClosedMixed = new CommerceReturnTarget(closedToken, 'CLOSED_MIXED');
  static Unknown = new CommerceReturnTarget(closedToken, 'UNKNOWN');
  static all = Object.freeze([this.None, this.Received, this.ClosedMixed]);
  static fromWire(value) { return this.all.find(candidate => candidate.wire === value) ?? this.Unknown; }
  get expectedRmaStatus() {
    if (this === CommerceReturnTarget.None) return CommerceRmaStatus.None;
    if (this === CommerceReturnTarget.Received) return CommerceRmaStatus.ReturnReceived;
    if (this === CommerceReturnTarget.ClosedMixed) return CommerceRmaStatus.Closed;
    return CommerceRmaStatus.Unknown;
  }
}
export class CommerceReplayDecision extends ClosedWireType {
  static CreateIntent = new CommerceReplayDecision(closedToken, 'CREATE_INTENT');
  static ResumeIntent = new CommerceReplayDecision(closedToken, 'RESUME_INTENT');
  static ReplayOrder = new CommerceReplayDecision(closedToken, 'REPLAY_ORDER');
  static Unknown = new CommerceReplayDecision(closedToken, 'UNKNOWN');
  static all = Object.freeze([this.CreateIntent, this.ResumeIntent, this.ReplayOrder]);
  static fromWire(value) { return this.all.find(candidate => candidate.wire === value) ?? this.Unknown; }
}

const namespace = 'ferreteria-falcon-commerce-v1';
export function stableUuid(key) {
  const hex = createHash('sha256').update(`${namespace}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function path(...commands) { return Object.freeze(commands); }
const blueprints = Object.freeze([
  [CommerceScenarioKind.PendingPayment, CommerceDeliveryMode.LocalDelivery, path(), CommerceReturnTarget.None, 2],
  [CommerceScenarioKind.PaidAwaitingPreparation, CommerceDeliveryMode.LocalDelivery, path(), CommerceReturnTarget.None, 2],
  [CommerceScenarioKind.Preparing, CommerceDeliveryMode.LocalDelivery, path(CommerceShipmentCommand.Preparing), CommerceReturnTarget.None, 2],
  [CommerceScenarioKind.Shipped, CommerceDeliveryMode.LocalDelivery, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.Shipped), CommerceReturnTarget.None, 2],
  [CommerceScenarioKind.Delivered, CommerceDeliveryMode.LocalDelivery, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.Shipped, CommerceShipmentCommand.Delivered), CommerceReturnTarget.None, 2],
  [CommerceScenarioKind.ReadyForPickup, CommerceDeliveryMode.Pickup, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.ReadyForPickup), CommerceReturnTarget.None, 2],
  [CommerceScenarioKind.PickedUp, CommerceDeliveryMode.Pickup, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.ReadyForPickup, CommerceShipmentCommand.PickedUp), CommerceReturnTarget.None, 2],
  [CommerceScenarioKind.ReturnReceived, CommerceDeliveryMode.LocalDelivery, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.Shipped, CommerceShipmentCommand.Delivered), CommerceReturnTarget.Received, 2],
  [CommerceScenarioKind.ReturnClosedMixed, CommerceDeliveryMode.LocalDelivery, path(CommerceShipmentCommand.Preparing, CommerceShipmentCommand.Shipped, CommerceShipmentCommand.Delivered), CommerceReturnTarget.ClosedMixed, 3],
]);

export function commerceScenarioDataset(products) {
  if (!Array.isArray(products)) throw new TypeError('Commerce scenarios require products');
  const candidates = products.filter(product => typeof product?.sku === 'string' && Number.isSafeInteger(product.stock) && product.stock >= 5 && Number.isFinite(product.price) && product.price > 0);
  if (candidates.length < blueprints.length) throw new Error('Commerce scenarios require nine saleable products');
  return Object.freeze(blueprints.map(([kind, deliveryMode, shipmentPath, returnTarget, quantity], index) => Object.freeze({
    key: kind.wire.toLowerCase().replaceAll('_', '-'),
    kind,
    deliveryMode,
    shipmentPath,
    returnTarget,
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
Object.freeze(CommercePaymentStatus.prototype);
Object.freeze(CommerceShipmentStatus.prototype);
Object.freeze(CommerceRmaStatus.prototype);
Object.freeze(CommerceDispositionState.prototype);
Object.freeze(CommerceReturnTarget.prototype);
Object.freeze(CommerceReplayDecision.prototype);
