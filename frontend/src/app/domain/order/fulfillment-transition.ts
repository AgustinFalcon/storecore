import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from './commerce-states';
import { AdminOrder } from './order.entity';
import { OrderFactState } from './order-projection';
import { DeliveryMode } from '../cart/delivery';

class ShipmentStep {
  constructor(readonly from: readonly ShipmentStatus[], readonly command: ShipmentTransition) {}
  accepts(status: ShipmentStatus): boolean { return this.from.includes(status); }
}
const prepare = new ShipmentStep([ShipmentStatus.NotCreated, ShipmentStatus.Pending], ShipmentTransition.Packed);
const send = new ShipmentStep([ShipmentStatus.Preparing], ShipmentTransition.Shipped);
const deliver = new ShipmentStep([ShipmentStatus.Shipped], ShipmentTransition.Delivered);
const ready = new ShipmentStep([ShipmentStatus.Preparing], ShipmentTransition.ReadyForPickup);
const collect = new ShipmentStep([ShipmentStatus.ReadyForPickup], ShipmentTransition.PickedUp);
const deliveryJourney = [prepare, send, deliver];
const pickupJourney = [prepare, ready, collect];
export function nextShipment(status: ShipmentStatus, mode = DeliveryMode.LocalDelivery): ShipmentTransition | null {
  if (!mode.known) return null;
  return (mode === DeliveryMode.Pickup ? pickupJourney : deliveryJourney).find(step => step.accepts(status))?.command ?? null;
}

export function nextRma(status: RmaStatus): RmaTransition | null {
  return status === RmaStatus.None ? RmaTransition.Received : null;
}

function eligible(order: AdminOrder): boolean {
  return order.payment.state === OrderFactState.Known && order.payment.value === PaymentStatus.Approved && order.payment.reason === null && order.fulfillmentEligibility === FulfillmentEligibility.Eligible && order.orderStatus === OrderStatus.Paid && order.paymentStatus === PaymentStatus.Approved && order.rmaStatus !== RmaStatus.Unknown;
}

export function allowedShipment(order: AdminOrder): ShipmentTransition | null {
  const decision = order.deliveryDecision;
  if (!decision?.canFulfill) return null;
  const next = nextShipment(order.shipmentStatus, decision.state.permitsLegacy ? DeliveryMode.LocalDelivery : decision.quote.mode);
  return eligible(order) && next !== null && order.shipmentAction === next ? next : null;
}

export function allowedRma(order: AdminOrder): RmaTransition | null {
  const decision = order.deliveryDecision;
  const final = decision?.quote.isPickup ? order.shipmentStatus === ShipmentStatus.PickedUp : order.shipmentStatus === ShipmentStatus.Delivered;
  return !!decision?.canFulfill && eligible(order) && final && order.rmaAction === RmaTransition.Received ? nextRma(order.rmaStatus) : null;
}

export function shipmentLabel(status: ShipmentTransition): string { return status.label; }
export function rmaLabel(status: RmaTransition): string { return status.label; }
