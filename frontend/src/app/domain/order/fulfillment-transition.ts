import { RmaTransition, ShipmentTransition } from './order.entity';

export function nextShipment(status: string): ShipmentTransition | null {
  switch (status) {
    case 'PACKED':
      return 'SHIPPED';
    case 'SHIPPED':
      return 'DELIVERED';
    case 'DELIVERED':
      return null;
    default:
      return 'PACKED';
  }
}

export function nextRma(status: string | null): RmaTransition | null {
  switch (status) {
    case 'RECEIVED':
      return 'INSPECTED';
    case 'INSPECTED':
      return 'ADJUSTED';
    case 'ADJUSTED':
      return null;
    default:
      return 'RECEIVED';
  }
}

export function shipmentLabel(status: ShipmentTransition): string {
  switch (status) {
    case 'PACKED':
      return 'Empacar';
    case 'SHIPPED':
      return 'Enviar';
    case 'DELIVERED':
      return 'Entregar';
  }
}

export function rmaLabel(status: RmaTransition): string {
  switch (status) {
    case 'RECEIVED':
      return 'RMA recibido';
    case 'INSPECTED':
      return 'Inspeccionar';
    case 'ADJUSTED':
      return 'Ajustar stock';
  }
}
