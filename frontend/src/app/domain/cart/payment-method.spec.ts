import { leavesForPaymentProvider } from './cart.entity';

describe('payment method exit', () => {
  it('leaves the window only for Mercado Pago when the url is allowlisted', () => {
    expect(leavesForPaymentProvider('MERCADO_PAGO', true)).toBe(true);
    expect(leavesForPaymentProvider('MERCADO_PAGO', false)).toBe(false);
  });

  it('keeps cash payment inside the storefront', () => {
    expect(leavesForPaymentProvider('CASH', true)).toBe(false);
    expect(leavesForPaymentProvider('CASH', false)).toBe(false);
  });
});
