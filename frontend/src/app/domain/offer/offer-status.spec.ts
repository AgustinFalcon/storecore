import { OfferStatus } from './offer-status';

describe('OfferStatus', () => {
  it('lists only writable console states', () => {
    expect(OfferStatus.writableOptions()).toEqual([OfferStatus.Draft, OfferStatus.Active]);
    expect(OfferStatus.fromWire('PAUSED').writable).toBe(false);
  });

  it('does not treat an unknown wire as a valid offer state', () => {
    expect(OfferStatus.fromWire('LIVE')).toBe(OfferStatus.Unknown);
    expect(OfferStatus.fromWire('LIVE').label).toBe('Estado de oferta no reconocido');
  });
});
