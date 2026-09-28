import { quoteShipping, shippingPrice } from './shipping-quote';

describe('quoteShipping', () => {
  it('prices the sample cart without a carrier', () => {
    const options = quoteShipping(25000);
    expect(options.map((option) => [option.id, option.price])).toEqual([
      ['PICKUP', 0],
      ['STANDARD', 2000],
      ['EXPRESS', 3750],
    ]);
  });

  it('keeps the minimum when the cart is small', () => {
    expect(shippingPrice(1000, 'STANDARD')).toBe(1500);
    expect(shippingPrice(1000, 'EXPRESS')).toBe(3500);
    expect(shippingPrice(1000, 'PICKUP')).toBe(0);
  });
});
