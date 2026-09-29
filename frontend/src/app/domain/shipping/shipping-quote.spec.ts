import { ShippingChoice } from '../order/closed-status';
import { quoteShipping, shippingPrice } from './shipping-quote';

describe('quoteShipping', () => {
  it('prices the sample cart without a carrier', () => {
    const options = quoteShipping(25000);
    expect(options.map((option) => [option.id, option.price])).toEqual([
      [ShippingChoice.Pickup, 0],
      [ShippingChoice.Standard, 2000],
      [ShippingChoice.Express, 3750],
    ]);
  });

  it('keeps the minimum when the cart is small', () => {
    expect(shippingPrice(1000, ShippingChoice.Standard)).toBe(1500);
    expect(shippingPrice(1000, ShippingChoice.Express)).toBe(3500);
    expect(shippingPrice(1000, ShippingChoice.Pickup)).toBe(0);
  });
});
