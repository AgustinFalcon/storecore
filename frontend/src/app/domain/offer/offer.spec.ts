import { DiscountKind, OfferStatus, OfferTransition } from './offer';

describe('offer closed types', () => {
  it('maps unknown wire values fail closed', () => {
    expect(OfferStatus.fromWire('PRIVATE')).toBe(OfferStatus.Unknown);
    expect(DiscountKind.fromWire('STACKED')).toBe(DiscountKind.Unknown);
    expect(OfferTransition.fromWire('DELETE')).toBe(OfferTransition.Unknown);
    expect(OfferTransition.for(OfferStatus.Unknown)).toEqual([]);
  });
  it('owns allowed transitions in transition objects', () => {
    expect(OfferTransition.for(OfferStatus.Draft)).toEqual([OfferTransition.Activate, OfferTransition.End]);
    expect(OfferTransition.for(OfferStatus.Active)).toEqual([OfferTransition.Pause, OfferTransition.End]);
    expect(OfferTransition.for(OfferStatus.Paused)).toEqual([OfferTransition.Activate, OfferTransition.End]);
    expect(OfferTransition.for(OfferStatus.Ended)).toEqual([]);
  });
  it('blocks the complete aggregate when any finite type is unknown', () => {
    const offer = {
      id: 1, name: 'Oferta', status: OfferStatus.Draft, priority: 0,
      startsAt: '2026-11-08T12:00:00Z', endsAt: '2026-11-09T12:00:00Z',
      discountKind: DiscountKind.Unknown, discountValue: 10, minMarginPercent: 0,
      skus: ['SKU'], createdAt: '2026-11-08T11:00:00Z', approvedAt: null,
    };
    expect(OfferTransition.forOffer(offer)).toEqual([]);
  });
});
