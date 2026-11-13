import { CartCurrency } from './cart-currency';
import { OrderStatus, PaymentStatus } from '../order/commerce-states';

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
  readonly lines: readonly CartLine[];
  readonly currency: CartCurrency;
}

export interface CheckoutCommand {
  readonly idempotencyKey: string;
  readonly addressId: string;
  readonly currency: CartCurrency;
}

export interface CheckoutReceipt {
  readonly orderId: string;
  readonly paymentStatus: PaymentStatus;
  readonly orderStatus: OrderStatus;
  readonly checkoutUrl?: string | null;
}
