import { FavoriteAvailability, FavoriteMutationOutcome } from '../../domain/favorite/favorite';
import { mapFavorite, mapFavoriteMutation } from './favorite-http.repository';

describe('Favorite HTTP translation', () => {
  const quote = { state: 'KNOWN', price: { base: 123, original: 123, effective: 123, offer: null } };
  it('translates availability once at the boundary', () => {
    expect(mapFavorite({ sku: 'SKU-1', name: 'Taladro', priceResolution: quote, price: 123, imageUrl: null, availability: 'AVAILABLE', addedAt: '2026-11-08T00:00:00Z' }))
      .toEqual(expect.objectContaining({ sku: 'SKU-1', availability: FavoriteAvailability.Available }));
    expect(mapFavorite({ sku: 'SKU-1', name: 'Taladro', priceResolution: quote, price: 123, availability: 'FUTURE', addedAt: '2026-11-08T00:00:00Z' }).availability).toBe(FavoriteAvailability.Unknown);
    expect(() => mapFavorite({ sku: '', name: 'Taladro', price: 123, availability: 'AVAILABLE', addedAt: 'bad' })).toThrow('fila inválida');
    for (const priceResolution of [null, {}, {state: 'UNKNOWN'}, {state: 'KNOWN', price: {base: -1}}, {state:'FUTURE',price:quote.price}]) {
      const unavailable = mapFavorite({sku:'SKU-1',name:'Taladro',priceResolution,availability:'AVAILABLE',addedAt:'2026-11-08T00:00:00Z'});
      expect(unavailable.price).toBeNull();
      expect(unavailable.availability).toBe(FavoriteAvailability.Unavailable);
      expect(unavailable.availability.canRemove).toBe(true);
    }
    const retired = mapFavorite({sku:'SKU-1',name:'Taladro',priceResolution:quote,availability:'UNAVAILABLE',addedAt:'2026-11-08T00:00:00Z'});
    expect(retired.price).toBeNull();
    expect(retired.availability.canRemove).toBe(true);
  });

  it('translates mutation outcomes once at the boundary', () => {
    expect(mapFavoriteMutation({ sku: 'SKU-1', outcome: 'REMOVED' }).outcome).toBe(FavoriteMutationOutcome.Removed);
    expect(mapFavoriteMutation({ sku: 'SKU-1', outcome: 'FUTURE' }).outcome).toBe(FavoriteMutationOutcome.Unknown);
  });
});
