import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from './commerce-states';
import { AdminOrder } from './order.entity';

export function nextShipment(status: ShipmentStatus): ShipmentTransition | null {
  if (status === ShipmentStatus.NotCreated || status === ShipmentStatus.Pending) return ShipmentTransition.Packed;
  if (status === ShipmentStatus.Preparing) return ShipmentTransition.Shipped;
  if (status === ShipmentStatus.Shipped) return ShipmentTransition.Delivered;
  return null;
}

export function nextRma(status: RmaStatus): RmaTransition | null {
  return status === RmaStatus.None ? RmaTransition.Received : null;
}

function eligible(order: AdminOrder): boolean {
  return order.fulfillmentEligibility === FulfillmentEligibility.Eligible && order.orderStatus === OrderStatus.Paid && order.paymentStatus === PaymentStatus.Approved && order.rmaStatus !== RmaStatus.Unknown;
}

export function allowedShipment(order: AdminOrder): ShipmentTransition | null {
  const next = nextShipment(order.shipmentStatus);
  return eligible(order) && next !== null && order.shipmentAction === next ? next : null;
}

export function allowedRma(order: AdminOrder): RmaTransition | null {
  return eligible(order) && order.shipmentStatus === ShipmentStatus.Delivered && order.rmaAction === RmaTransition.Received ? nextRma(order.rmaStatus) : null;
}

export function shipmentLabel(status: ShipmentTransition): string { return status.label; }
export function rmaLabel(status: RmaTransition): string { return status.label; }
