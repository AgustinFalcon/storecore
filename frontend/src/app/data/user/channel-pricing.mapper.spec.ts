import { ChannelAvailability, ChannelFactReason, ListingStatus, ObservationFreshness, PolicyStatus, PolicyTransition, PriceCurrency, PriceScope, PriceWriter } from '../../domain/user/channel-pricing';
import { mapChannelAccount, mapChannelListing, mapChannelObservation, mapChannelPage, mapPricePolicy } from './channel-pricing.mapper';
import { accountWire, historicalObservation, listingWire, promoWire, unavailableObservation } from './channel-pricing.spec-fixtures';

describe('persisted pricing and channel boundary', () => {
  it('preserves persisted prices, scope, window and server approval without fabricating priority or cost', () => {
    const policy = mapPricePolicy({ ...promoWire, status: 'ACTIVE', priceScope: 'CAMPAIGN', approvedBy: 'admin-7', approvedAt: '2026-11-08T10:00:01Z', effectivePromoPrice: 85 });
    expect(policy).toMatchObject({ basePrice: 100, desiredPrice: 90, effectivePromoPrice: 85, status: PolicyStatus.Active, priceScope: PriceScope.Campaign, writer: PriceWriter.Manual, currency: PriceCurrency.Ars, approvedBy: 'admin-7', approvedAt: '2026-11-08T10:00:01Z', validFrom: promoWire.validFrom, validTo: promoWire.validTo });
    expect(policy).not.toHaveProperty('priority'); expect(policy).not.toHaveProperty('margin');
  });
  it('closes every policy transition and unknown authority', () => {
    expect(PolicyTransition.for(PolicyStatus.Draft)).toEqual([PolicyTransition.Activate]);
    expect(PolicyTransition.for(PolicyStatus.Active)).toEqual([PolicyTransition.Pause, PolicyTransition.End]);
    expect(PolicyTransition.for(PolicyStatus.Paused)).toEqual([PolicyTransition.Activate, PolicyTransition.End]);
    for (const state of [PolicyStatus.Ended, PolicyStatus.Unknown]) expect(PolicyTransition.for(state)).toEqual([]);
    const policy = mapPricePolicy({ ...promoWire, status: 'FUTURE', writer: 'AUTO', priceScope: 'ANY', currency: 'USD' });
    expect(policy.status).toBe(PolicyStatus.Unknown); expect(policy.writer).toBe(PriceWriter.Unknown); expect(policy.priceScope).toBe(PriceScope.Unknown); expect(policy.currency).toBe(PriceCurrency.Unknown);
    expect(PolicyTransition.fromWire('FUTURE')).toBe(PolicyTransition.Unknown);
  });
  it('retains observed zero as historical and missing values as unavailable', () => {
    const listing = mapChannelListing(listingWire);
    expect(listing.desiredQuantity).toBe(4); expect(listing.desiredPrice).toBe(100);
    expect(listing.observedQuantity).toEqual({ state: ChannelAvailability.Known, value: 0, freshness: ObservationFreshness.Unverified, reason: null });
    expect(listing.observedPrice).toEqual({ state: ChannelAvailability.Unavailable, value: null, freshness: ObservationFreshness.Unavailable, reason: ChannelFactReason.ExternalNotAvailable });
    expect(listing.updatedAt).toBe(listingWire.updatedAt); expect(listing).not.toHaveProperty('observedAt');
    expect(mapChannelListing({ ...listingWire, status: 'FUTURE' }).status).toBe(ListingStatus.Unknown);
  });
  it('rejects coerced, negative, fractional and contradictory observations', () => {
    for (const value of ['0', -1, Number.NaN, undefined]) expect(() => mapChannelObservation({ ...historicalObservation, value })).toThrow();
    expect(() => mapChannelObservation({ ...historicalObservation, value: .5 }, true)).toThrow();
    expect(() => mapChannelObservation({ ...historicalObservation, freshness: 'UNAVAILABLE' })).toThrow();
    expect(() => mapChannelObservation({ ...unavailableObservation, value: 0 })).toThrow();
    expect(mapChannelObservation({ ...historicalObservation, freshness: 'FRESH' }).value).toBeNull();
  });
  it('never infers OAuth authorization or provider health from local account data', () => {
    const account = mapChannelAccount({ ...accountWire, secretRef: 'must-not-leak', authorized: true });
    expect(account).not.toHaveProperty('authorized'); expect(account).not.toHaveProperty('secretRef');
    expect(mapChannelAccount({ accountRef: null, status: 'UNKNOWN', availability: 'UNAVAILABLE', reason: 'EXTERNAL_NOT_AVAILABLE', updatedAt: null }).availability).toBe(ChannelAvailability.Unavailable);
    expect(() => mapChannelAccount({ ...accountWire, accountRef: null })).toThrow();
  });
  it('bounds pages and rejects malformed identities, values and pagination', () => {
    expect(mapChannelPage({ items: [listingWire], page: 0, size: 25, total: 51 }, mapChannelListing).metadata.total).toBe(51);
    for (const size of [0, 51, '25']) expect(() => mapChannelPage({ items: [], page: 0, size, total: 0 }, mapChannelListing)).toThrow();
    for (const patch of [{ desiredQuantity: .5 }, { manualInterventionRequired: 'false' }, { sku: '' }, { updatedAt: 'invalid' }]) expect(() => mapChannelListing({ ...listingWire, ...patch })).toThrow();
    for (const patch of [{ desiredPrice: null }, { basePrice: '100' }, { approvedAt: 'invalid' }, { validTo: promoWire.validFrom }, { effectivePromoPrice: 91 }, { approvedBy: 'unpaired' }, { status: PolicyStatus.Active.wire }]) expect(() => mapPricePolicy({ ...promoWire, ...patch })).toThrow();
  });
});
