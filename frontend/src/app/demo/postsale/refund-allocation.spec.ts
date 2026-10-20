import { DemoRefundAllocation } from './refund-allocation';

describe('DemoRefundAllocation', () => {
  it('allocates every integer cent deterministically across partial returns', () => {
    const allocation = new DemoRefundAllocation();
    expect([0, 1, 2].map(prior => allocation.amount(100, 3, prior, 1))).toEqual([34, 33, 33]);
    expect(allocation.amount(100, 3, 0, 2) + allocation.amount(100, 3, 2, 1)).toBe(100);
  });

  it('rejects fractional, negative and excessive quantities', () => {
    const allocation = new DemoRefundAllocation();
    for (const quantity of [0, -1, 0.5, 4, Number.NaN]) expect(() => allocation.amount(100, 3, 0, quantity)).toThrow();
  });
});
