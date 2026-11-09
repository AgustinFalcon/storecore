import { describe, expect, it } from 'vitest';
import { DiscountKind, OfferStatus } from '../../domain/offer/offer';
import { mapOffer } from './offer-http.repository';

const valid = {
  id: 7, name: 'Semana herramientas', status: 'DRAFT', priority: 10,
  startsAt: '2026-11-08T12:00:00Z', endsAt: '2026-11-15T12:00:00Z',
  discountKind: 'PERCENT', discountValue: 12.5, minMarginPercent: 0,
  skus: ['SKU-1'], createdAt: '2026-11-08T11:00:00Z', approvedAt: null,
};

describe('offer HTTP mapper', () => {
  it('maps known values without coercing numbers', () => {
    const result = mapOffer(valid);
    expect(result.status).toBe(OfferStatus.Draft);
    expect(result.discountKind).toBe(DiscountKind.Percent);
    expect(result.discountValue).toBe(12.5);
  });
  it('preserves unknown finite states as disabled domain values', () => {
    const result = mapOffer({ ...valid, status: 'PRIVATE', discountKind: 'STACKED' });
    expect(result.status).toBe(OfferStatus.Unknown);
    expect(result.discountKind).toBe(DiscountKind.Unknown);
  });
  it.each([
    { ...valid, id: '7' }, { ...valid, discountValue: '12.5' }, { ...valid, skus: [] },
    { ...valid, startsAt: 'not-a-date' }, { ...valid, approvedAt: 'not-a-date' },
  ])('rejects malformed wire rows', (row) => expect(() => mapOffer(row)).toThrow());
});
