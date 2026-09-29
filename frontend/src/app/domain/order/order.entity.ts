import type { PaymentMethod, OrderStatus, PaymentStatus, RmaStatus, ShipmentStatus } from './closed-status';

export interface CustomerOrder {
  readonly id: string;
  readonly orderStatus: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly shipmentStatus: ShipmentStatus;
  readonly tracking: string | null;
  readonly paymentMethod: PaymentMethod | null;
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

export type ShipmentTransition = 'PACKED' | 'SHIPPED' | 'DELIVERED';
export type RmaTransition = 'RECEIVED' | 'INSPECTED' | 'ADJUSTED';
