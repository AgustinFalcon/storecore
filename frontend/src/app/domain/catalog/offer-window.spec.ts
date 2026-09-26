import { isApiOfferVisible, isValidOfferWindow, toInstallationInstant } from './offer-window';

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

  it('turns a local datetime-local value into the same instant', () => {
    const local = '2026-09-26T18:00';
    const instant = toInstallationInstant(local);
    expect(instant.endsWith('Z')).toBe(true);
    expect(Date.parse(instant)).toBe(Date.parse(local));
  });
});
