import { RmaStatus, ShipmentStatus } from './closed-status';
import { RmaTransition, ShipmentTransition } from './order.entity';

export function nextShipment(status: ShipmentStatus): ShipmentStatus | null {
  if (status === ShipmentStatus.Preparing) {
    return ShipmentStatus.Shipped;
  }
  if (status === ShipmentStatus.Shipped) {
    return ShipmentStatus.Delivered;
  }
  if (status === ShipmentStatus.Delivered || status === ShipmentStatus.Unknown) {
    return null;
  }
  return ShipmentStatus.Packed;
}

export function shipmentCommand(status: ShipmentStatus): ShipmentTransition {
  if (status === ShipmentStatus.Packed) {
    return 'PACKED';
  }
  if (status === ShipmentStatus.Shipped) {
    return 'SHIPPED';
  }
  if (status === ShipmentStatus.Delivered) {
    return 'DELIVERED';
  }
  throw new Error('Estado de envío sin transición');
}

export function nextRma(status: RmaStatus | null): RmaStatus | null {
  if (status === RmaStatus.ReturnReceived) {
    return RmaStatus.Inspected;
  }
  if (status === RmaStatus.Inspected) {
    return RmaStatus.Adjusted;
  }
  if (status === RmaStatus.Closed) {
    return null;
  }
  return RmaStatus.Received;
}

export function rmaCommand(status: RmaStatus): RmaTransition {
  if (status === RmaStatus.Received) {
    return 'RECEIVED';
  }
  if (status === RmaStatus.Inspected) {
    return 'INSPECTED';
  }
  if (status === RmaStatus.Adjusted) {
    return 'ADJUSTED';
  }
  throw new Error('Estado de RMA sin transición');
}
