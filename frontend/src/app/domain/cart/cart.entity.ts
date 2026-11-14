import { CartCurrency } from './cart-currency';
import { OrderStatus, PaymentStatus } from '../order/commerce-states';
import { DeliveryMode, DeliveryQuote } from './delivery';

export interface CartLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly originalUnitPrice: number;
  readonly discountAmount: number;
  readonly offerRef: string | null;
  readonly campaignRef: string | null;
  readonly effectiveUnitPrice: number;
}

export interface Cart {
  readonly revision: string;
  readonly deliveryOptions?: readonly DeliveryQuote[];
  readonly lines: readonly CartLine[];
  readonly currency: CartCurrency;
}

export interface CheckoutCommand {
  readonly cartRevision: string;
  readonly deliveryMode: DeliveryMode;
  readonly deliveryConfigurationVersion: number;
  readonly idempotencyKey: string;
  readonly addressId: string | null;
  readonly addressRevision: string | null;
  readonly currency: CartCurrency;
}

export interface CheckoutReceipt {
  readonly orderId: string;
  readonly paymentStatus: PaymentStatus;
  readonly orderStatus: OrderStatus;
  readonly checkoutUrl?: string | null;
}
