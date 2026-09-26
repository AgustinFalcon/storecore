import { catalogOffersBadge, isApiOfferVisible, isValidOfferWindow, showsOfferBadge, toInstallationInstant, withoutClosedOfferBadge } from './offer-window';

const from = '2026-09-26T18:00:00.000Z';
const until = '2026-09-26T20:00:00.000Z';

describe('offer window', () => {
  it('keeps the offer while now is inside the window', () => {
    expect(isApiOfferVisible(from, until, new Date('2026-09-26T18:00:00.000Z'))).toBe(true);
    expect(isApiOfferVisible(from, until, new Date('2026-09-26T19:59:00.000Z'))).toBe(true);
  });

  it('hides the offer before the window', () => {
    expect(isApiOfferVisible(from, until, new Date('2026-09-26T17:59:59.000Z'))).toBe(false);
  });

  it('hides the offer after the window', () => {
    expect(isApiOfferVisible(from, until, new Date('2026-09-26T20:00:00.000Z'))).toBe(false);
  });

  it('does not hide an API offer when the payload has no window', () => {
    const now = new Date('2026-09-26T12:00:00.000Z');
    expect(isApiOfferVisible(null, null, now)).toBe(true);
    expect(isApiOfferVisible(undefined, undefined, now)).toBe(true);
    expect(isApiOfferVisible('', '', now)).toBe(true);
    expect(isApiOfferVisible(from, null, now)).toBe(true);
    expect(isApiOfferVisible(null, until, now)).toBe(true);
  });

  it('rejects a window whose end is not after its start', () => {
    expect(isValidOfferWindow(until, from)).toBe(false);
    expect(isValidOfferWindow(from, from)).toBe(false);
    expect(isValidOfferWindow('2026-09-26T20:00', '2026-09-26T18:00')).toBe(false);
    expect(isValidOfferWindow('2026-09-26T18:00', '2026-09-26T18:00')).toBe(false);
    expect(isValidOfferWindow(from, until)).toBe(true);
    expect(isValidOfferWindow('2026-09-26T18:00', '2026-09-26T20:00')).toBe(true);
  });

  it('keeps the product and drops only the badge when the window is closed', () => {
    const price = { base: 100, effective: 80 };
    const closed = {
      sku: 'SKU-1',
      name: 'Lámpara',
      price,
      offerRef: 'O-1',
      active: false,
      validFrom: from,
      validUntil: until,
    };
    const shown = withoutClosedOfferBadge(closed, new Date('2026-09-26T20:00:00.000Z'));
    expect(shown.sku).toBe('SKU-1');
    expect(shown.name).toBe('Lámpara');
    expect(shown.price).toBe(price);
    expect(shown.active).toBe(false);
    expect(shown.offerRef).toBeNull();
    expect(shown.validFrom).toBe(from);
    expect(shown.validUntil).toBe(until);

    const stillListed = [closed, { ...closed, sku: 'SKU-2', offerRef: null }].map((product) =>
      withoutClosedOfferBadge(product, new Date('2026-09-26T21:00:00.000Z')),
    );
    expect(stillListed.map((product) => product.sku)).toEqual(['SKU-1', 'SKU-2']);
    expect(stillListed[0].offerRef).toBeNull();
    expect(stillListed[0].price).toBe(price);
    expect(stillListed[1]).toEqual({ ...closed, sku: 'SKU-2', offerRef: null });
  });

  it('leaves offerRef and the effective price unchanged when the payload has no window', () => {
    const product = { sku: 'SKU-1', price: 80, offerRef: 'O-1' };
    expect(withoutClosedOfferBadge(product, new Date('2026-09-26T12:00:00.000Z'))).toBe(product);
  });

  it('leaves the badge when the window is open', () => {
    const product = { sku: 'SKU-1', price: 80, offerRef: 'O-1', validFrom: from, validUntil: until };
    expect(withoutClosedOfferBadge(product, new Date('2026-09-26T18:30:00.000Z'))).toBe(product);
  });

  it('keeps the catalog Oferta badge for Sólo ofertas when the payload has no window', () => {
    const now = new Date('2026-09-26T12:00:00.000Z');
    expect(catalogOffersBadge(true, null, null, now)).toBe(true);
    expect(catalogOffersBadge(false, null, null, now)).toBe(false);
  });

  it('drops the catalog Oferta badge when Sólo ofertas is on and the window is closed', () => {
    const now = new Date('2026-09-26T21:00:00.000Z');
    expect(catalogOffersBadge(true, from, until, now)).toBe(false);
    expect(catalogOffersBadge(true, from, until, new Date('2026-09-26T19:00:00.000Z'))).toBe(true);
  });

  it('hides the Oferta badge outside the window and keeps an offer that has no window', () => {
    const now = new Date('2026-09-26T12:00:00.000Z');
    const inside = new Date('2026-09-26T18:30:00.000Z');
    expect(showsOfferBadge('O-1', from, until, inside)).toBe(true);
    expect(showsOfferBadge('O-1', from, until, now)).toBe(false);
    expect(showsOfferBadge('O-1', from, until, new Date('2026-09-26T20:00:00.000Z'))).toBe(false);
    expect(showsOfferBadge('O-1', undefined, undefined, now)).toBe(true);
    expect(showsOfferBadge(null, from, until, inside, true)).toBe(true);
    expect(showsOfferBadge(null, from, until, now, true)).toBe(false);
    expect(showsOfferBadge(null, undefined, undefined, now, true)).toBe(true);
    expect(showsOfferBadge(null, undefined, undefined, now, false)).toBe(false);
  });

  it('turns a local datetime-local value into the same instant', () => {
    const local = '2026-09-26T18:00';
    const instant = toInstallationInstant(local);
    expect(instant.endsWith('Z')).toBe(true);
    expect(Date.parse(instant)).toBe(Date.parse(local));
  });
});
