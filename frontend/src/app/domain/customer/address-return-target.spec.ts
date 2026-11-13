import { AddressReturnTarget } from './address-return-target';

describe('AddressReturnTarget', () => {
  it('only translates the fixed checkout destination', () => {
    expect(AddressReturnTarget.fromWire(AddressReturnTarget.Checkout.wire)).toBe(AddressReturnTarget.Checkout);
    expect(AddressReturnTarget.Checkout.path).toBe('/checkout');
    expect(AddressReturnTarget.Checkout.label).toBe('Volver al checkout');
  });
  it.each([null, undefined, '', '/checkout', 'https://example.test', 'CHECKOUT', {}, 1])('rejects unknown wire %s', (raw) => {
    expect(AddressReturnTarget.fromWire(raw)).toBe(AddressReturnTarget.Unknown);
    expect(AddressReturnTarget.fromWire(raw).path).toBeNull();
  });
});
