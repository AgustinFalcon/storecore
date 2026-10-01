import { OrderStatus } from './order-status';
import { PaymentStatus } from './payment-status';
import { RmaStatus } from './rma-status';
import { ShipmentStatus } from './shipment-status';

export { OrderStatus } from './order-status';
export { PaymentStatus } from './payment-status';
export { RmaStatus, RmaTransition } from './rma-status';
export { ShipmentStatus, ShipmentTransition } from './shipment-status';

export interface CustomerOrder {
  readonly id: string;
  readonly orderStatus: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly shipmentStatus: ShipmentStatus;
  readonly tracking: string | null;
  readonly total: number;
  readonly lines: readonly {
    readonly sku: string;
    readonly name: string;
    readonly quantity: number;
    readonly originalUnitPrice: number;
    readonly discountAmount: number;
    readonly offerRef: string | null;
    readonly campaignRef: string | null;
    readonly effectiveUnitPrice: number;
  }[];
}

export interface AdminOrder extends CustomerOrder {
  readonly rmaStatus: RmaStatus | null;
}
