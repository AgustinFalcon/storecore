import { FavoriteAvailability, FavoriteMutationOutcome } from './favorite';

describe('favorite closed types', () => {
  it('maps only supported availability values and fails closed', () => {
    expect(FavoriteAvailability.fromWire('AVAILABLE')).toBe(FavoriteAvailability.Available);
    expect(FavoriteAvailability.fromWire('UNAVAILABLE')).toBe(FavoriteAvailability.Unavailable);
    expect(FavoriteAvailability.fromWire('future')).toBe(FavoriteAvailability.Unknown);
    expect(FavoriteAvailability.Unknown.canPurchase).toBe(false);
    expect(FavoriteAvailability.Unknown.canRemove).toBe(false);
  });

  it('maps mutation outcomes without accepting unknown wire values', () => {
    expect(FavoriteMutationOutcome.fromWire('ADDED')).toBe(FavoriteMutationOutcome.Added);
    expect(FavoriteMutationOutcome.fromWire('LIMIT_REACHED')).toBe(FavoriteMutationOutcome.LimitReached);
    expect(FavoriteMutationOutcome.fromWire('future')).toBe(FavoriteMutationOutcome.Unknown);
    expect(FavoriteMutationOutcome.Unknown.accepted).toBe(false);
  });
});
