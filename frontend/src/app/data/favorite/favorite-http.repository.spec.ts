import { FavoriteAvailability, FavoriteMutationOutcome } from '../../domain/favorite/favorite';
import { mapFavorite, mapFavoriteMutation } from './favorite-http.repository';

describe('Favorite HTTP translation', () => {
  it('translates availability once at the boundary', () => {
    expect(mapFavorite({ sku: 'SKU-1', name: 'Taladro', price: 123, imageUrl: null, availability: 'AVAILABLE', addedAt: '2026-11-08T00:00:00Z' }))
      .toEqual(expect.objectContaining({ sku: 'SKU-1', availability: FavoriteAvailability.Available }));
    expect(mapFavorite({ sku: 'SKU-1', name: 'Taladro', price: 123, availability: 'FUTURE', addedAt: '2026-11-08T00:00:00Z' }).availability).toBe(FavoriteAvailability.Unknown);
    expect(() => mapFavorite({ sku: '', name: 'Taladro', price: 123, availability: 'AVAILABLE', addedAt: 'bad' })).toThrow('fila inválida');
    for (const price of [null, '', false, []]) {
      expect(() => mapFavorite({ sku: 'SKU-1', name: 'Taladro', price, availability: 'AVAILABLE', addedAt: '2026-11-08T00:00:00Z' })).toThrow('fila inválida');
    }
  });

  it('translates mutation outcomes once at the boundary', () => {
    expect(mapFavoriteMutation({ sku: 'SKU-1', outcome: 'REMOVED' }).outcome).toBe(FavoriteMutationOutcome.Removed);
    expect(mapFavoriteMutation({ sku: 'SKU-1', outcome: 'FUTURE' }).outcome).toBe(FavoriteMutationOutcome.Unknown);
  });
});
