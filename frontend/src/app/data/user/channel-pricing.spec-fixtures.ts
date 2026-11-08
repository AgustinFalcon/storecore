import { mapChannelAccount, mapChannelListing, mapChannelPage } from './channel-pricing.mapper';
export const unavailableObservation = { state: 'UNAVAILABLE', value: null, freshness: 'UNAVAILABLE', reason: 'EXTERNAL_NOT_AVAILABLE' };
export const historicalObservation = { state: 'KNOWN', value: 0, freshness: 'UNVERIFIED', reason: null };
export const accountWire = { accountRef: 'seller-1', status: 'ACTIVE', availability: 'KNOWN', reason: null, updatedAt: '2026-11-08T10:00:00Z' };
export const listingWire = { listingId: 'MLA-1', variationId: '', sku: 'SKU-1', accountRef: 'seller-1', status: 'ACTIVE', desiredQuantity: 4, desiredPrice: 100, observedQuantity: historicalObservation, observedPrice: unavailableObservation, manualInterventionRequired: true, updatedAt: '2026-11-08T10:00:00Z' };
export const promoWire = { id: '1', listingSku: 'SKU-1', currency: 'ARS', priceScope: 'DEFAULT', basePrice: 100, desiredPrice: 90, observedPrice: unavailableObservation, effectivePromoPrice: null, status: 'DRAFT', validFrom: '2026-11-08T10:00:00Z', validTo: '2026-11-09T10:00:00Z', writer: 'MANUAL', approvedBy: null, approvedAt: null };
export const channelAccountFixture = (patch = {}) => mapChannelAccount({ ...accountWire, ...patch });
export const channelListingFixture = (patch = {}) => mapChannelListing({ ...listingWire, ...patch });
export const channelPageFixture = (items: readonly unknown[] = [], page = 0, total = items.length) => mapChannelPage({ items, page, size: 25, total }, value => value);
