import { OrderStatus, PaymentStatus, ShipmentStatus, RmaStatus, FulfillmentEligibility, ShipmentTransition, RmaTransition } from './commerce-states';
import { DeliverySnapshot, OrderFact, OrderTimelineEvent } from './order-projection';
import { ReturnEligibility } from './return-eligibility';
export { ShipmentTransition, RmaTransition } from './commerce-states';

export interface CustomerOrder {
  readonly orderNumber: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly currency: string | null;
  readonly subtotal: number | null;
  readonly shippingCost: number | null;
  readonly buyerName: OrderFact<string>;
  readonly buyerEmail: OrderFact<string>;
  readonly delivery: OrderFact<DeliverySnapshot>;
  readonly payment: OrderFact<PaymentStatus>;
  readonly timeline: OrderFact<readonly OrderTimelineEvent[]>;
  readonly returnEligibility: ReturnEligibility;
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
  readonly rmaStatus: RmaStatus;
  readonly fulfillmentEligibility: FulfillmentEligibility;
  readonly shipmentAction: ShipmentTransition | null;
  readonly rmaAction: RmaTransition | null;
}
