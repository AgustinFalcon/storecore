import { CheckoutAttemptState } from './checkout-attempt-state';

describe('CheckoutAttemptState', () => {
  it.each([CheckoutAttemptState.Idle, CheckoutAttemptState.Pending, CheckoutAttemptState.Retryable, CheckoutAttemptState.ProductUnavailable, CheckoutAttemptState.Succeeded, CheckoutAttemptState.Unknown])('owns payment policies and round trips %s', (state) => {
    expect(CheckoutAttemptState.fromWire(state.wire)).toBe(state);
    expect(state.inFlight).toBe(state === CheckoutAttemptState.Pending);
    expect(state.paymentRetry).toBe(state === CheckoutAttemptState.Retryable);
    expect(state.requiresCartCorrection).toBe(state === CheckoutAttemptState.ProductUnavailable);
  });
  it.each([null, undefined, '', 'future', {}, 1])('fails closed for %s', (value) => {
    expect(CheckoutAttemptState.fromWire(value)).toBe(CheckoutAttemptState.Unknown);
    expect(CheckoutAttemptState.fromWire(value).paymentRetry).toBe(false);
  });
});
