import type { PaymentMethodId } from '../cart/cart.entity';

export interface CustomerOrder {
  readonly id: string;
  readonly orderStatus: string;
  readonly paymentStatus: string;
  readonly shipmentStatus: string;
  readonly tracking: string | null;
  readonly paymentMethod: PaymentMethodId | null;
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
  readonly rmaStatus: string | null;
}

export type ShipmentTransition = 'PACKED' | 'SHIPPED' | 'DELIVERED';
export type RmaTransition = 'RECEIVED' | 'INSPECTED' | 'ADJUSTED';
