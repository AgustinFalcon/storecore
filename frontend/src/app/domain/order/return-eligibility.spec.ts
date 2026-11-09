import { ReturnEligibility } from './return-eligibility';

describe('ReturnEligibility boundary', () => {
  it('preserves each closed informational result', () => {
    for (const value of [ReturnEligibility.Eligible, ReturnEligibility.PaymentUnverified, ReturnEligibility.NotDelivered, ReturnEligibility.AlreadyOpen, ReturnEligibility.Unavailable]) {
      expect(ReturnEligibility.fromWire(value.wire)).toBe(value);
    }
  });
  it('does not present future or absent values as eligibility', () => {
    for (const raw of ['eligible', 'FUTURE', null, undefined, {}]) expect(ReturnEligibility.fromWire(raw)).toBe(ReturnEligibility.Unknown);
  });
});
