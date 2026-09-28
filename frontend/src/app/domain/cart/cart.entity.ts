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
  readonly currency: string;
}

export type PaymentMethodId = 'MERCADO_PAGO' | 'CASH';

export function leavesForPaymentProvider(method: PaymentMethodId, allowlistedUrl: boolean): boolean {
  return method === 'MERCADO_PAGO' && allowlistedUrl;
}

export interface CheckoutCommand {
  readonly idempotencyKey: string;
  readonly addressId: string;
  readonly currency: string;
  readonly paymentMethod: PaymentMethodId;
}

export interface CheckoutReceipt {
  readonly orderId: string;
  readonly paymentStatus: string;
  readonly orderStatus: string;
  readonly checkoutUrl?: string | null;
}
