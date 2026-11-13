import { CartFailureKind } from './cart-failure-kind';

describe('CartFailureKind', () => {
  it.each([CartFailureKind.None, CartFailureKind.Load, CartFailureKind.CurrencyUnavailable, CartFailureKind.Unknown])('owns read recovery and round trips %s', (state) => {
    expect(CartFailureKind.fromWire(state.wire)).toBe(state);
    expect(state.readFailure).toBe(state === CartFailureKind.Load || state === CartFailureKind.Unknown);
  });
  it.each([null, undefined, '', 'future', {}, 'CHECKOUT_RETRYABLE'])('fails closed for %s', (value) => {
    expect(CartFailureKind.fromWire(value)).toBe(CartFailureKind.Unknown);
    expect(CartFailureKind.fromWire(value).readFailure).toBe(true);
  });
});
