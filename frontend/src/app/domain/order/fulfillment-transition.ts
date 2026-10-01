import { RmaStatus, RmaTransition } from './rma-status';
import { ShipmentStatus, ShipmentTransition } from './shipment-status';

export function nextShipment(status: ShipmentStatus | string): ShipmentTransition | null {
  const current = status instanceof ShipmentStatus ? status : ShipmentStatus.fromWire(status);
  return current.next;
}

export function nextRma(status: RmaStatus | string | null): RmaTransition | null {
  if (status instanceof RmaStatus) {
    return status.next;
  }
  const current = RmaStatus.fromOptionalWire(status);
  if (current == null) {
    return RmaTransition.Received;
  }
  return current.next;
}

export function shipmentLabel(status: ShipmentTransition): string {
  return status.label;
}

export function rmaLabel(status: RmaTransition): string {
  return status.label;
}
