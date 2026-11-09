import { BoundedPageRequest, boundedPageNavigation } from './bounded-page';

describe('bounded page', () => {
  it('creates explicit bounded requests', () => {
    expect(BoundedPageRequest.first()).toMatchObject({ page: 0, size: 50 });
    expect(BoundedPageRequest.at(2, 25)).toMatchObject({ page: 2, size: 25 });
  });

  it('rejects invalid requests', () => {
    for (const page of [-1, 10_001, 1.5, Number.NaN]) expect(() => BoundedPageRequest.at(page)).toThrow();
    for (const size of [0, 51, 1.5]) expect(() => BoundedPageRequest.first(size)).toThrow();
  });

  it('derives boundaries and one-shot recovery target', () => {
    expect(boundedPageNavigation({ total: 51, page: 0, size: 50, truncated: true })).toEqual({
      page: 0, totalPages: 2, hasPrevious: false, hasNext: true, recoveryPage: null,
    });
    expect(boundedPageNavigation({ total: 50, page: 1, size: 50, truncated: false }).recoveryPage).toBe(0);
    expect(boundedPageNavigation({ total: 0, page: 4, size: 50, truncated: false }).recoveryPage).toBe(0);
  });

  it('fails closed for malformed metadata', () => {
    expect(boundedPageNavigation({ total: -1, page: 0, size: 50, truncated: false })).toEqual({
      page: 0, totalPages: 1, hasPrevious: false, hasNext: false, recoveryPage: null,
    });
  });
});
