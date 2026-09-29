import { PaymentMethod } from '../order/closed-status';
import { leavesForPaymentProvider } from './cart.entity';

describe('payment method exit', () => {
  it('leaves the window only for Mercado Pago when the url is allowlisted', () => {
    expect(leavesForPaymentProvider(PaymentMethod.MercadoPago, true)).toBe(true);
    expect(leavesForPaymentProvider(PaymentMethod.MercadoPago, false)).toBe(false);
  });

  it('keeps cash payment inside the storefront', () => {
    expect(leavesForPaymentProvider(PaymentMethod.Cash, true)).toBe(false);
    expect(leavesForPaymentProvider(PaymentMethod.Cash, false)).toBe(false);
  });
});
