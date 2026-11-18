import { of, Subject } from 'rxjs';
import { FavoriteAvailability, FavoriteMutationOutcome } from '../../domain/favorite/favorite';
import { AddFavoriteUseCase } from '../../domain/favorite/use-cases/add-favorite.usecase';
import { ListFavoritesUseCase } from '../../domain/favorite/use-cases/list-favorites.usecase';
import { RemoveFavoriteUseCase } from '../../domain/favorite/use-cases/remove-favorite.usecase';
import { CustomerFavoritesStore } from './customer-favorites.store';

describe('CustomerFavoritesStore selection scope', () => {
  it('never publishes feedback from SKU A after the PDP selected SKU B', () => {
    const pending = new Subject<{ sku: string; outcome: FavoriteMutationOutcome }>();
    const store = new CustomerFavoritesStore(
      { execute: () => of([]) } as unknown as ListFavoritesUseCase,
      { execute: () => pending } as unknown as AddFavoriteUseCase,
      { execute: () => pending } as unknown as RemoveFavoriteUseCase,
    );
    let feedback = '';
    const subscription = store.feedback$.subscribe(value => { feedback = value; });
    store.selectSku('A');
    store.add('A');
    store.selectSku('B');
    pending.next({ sku: 'A', outcome: FavoriteMutationOutcome.Added });
    expect(feedback).toBe('');
    subscription.unsubscribe();
    store.ngOnDestroy();
  });

  it('suppresses a late mutation error from SKU A after the PDP selected SKU B', () => {
    const pending = new Subject<{ sku: string; outcome: FavoriteMutationOutcome }>();
    const store = new CustomerFavoritesStore(
      { execute: () => of([]) } as unknown as ListFavoritesUseCase,
      { execute: () => pending } as unknown as AddFavoriteUseCase,
      { execute: () => pending } as unknown as RemoveFavoriteUseCase,
    );
    let message = ''; let error = '';
    const messageSubscription = store.selectedMessage$.subscribe(value => { message = value; });
    const stateSubscription = store.viewState$.subscribe(state => { error = state.errorMessage; });
    store.selectSku('A'); store.add('A'); store.selectSku('B');
    pending.error(new Error('fallo tardío de A'));
    expect(message).toBe('');
    expect(error).toBe('');
    messageSubscription.unsubscribe(); stateSubscription.unsubscribe(); store.ngOnDestroy();
  });

  it('keeps mutation feedback in the unscoped favorites list', () => {
    const item = { sku: 'A', name: 'Producto A', price: 10, imageUrl: null, addedAt: '2026-11-17T00:00:00Z',
      availability: FavoriteAvailability.Available };
    const store = new CustomerFavoritesStore(
      { execute: () => of([item]) } as unknown as ListFavoritesUseCase,
      { execute: () => of({ sku: 'A', outcome: FavoriteMutationOutcome.Added }) } as unknown as AddFavoriteUseCase,
      { execute: () => of({ sku: 'A', outcome: FavoriteMutationOutcome.Removed }) } as unknown as RemoveFavoriteUseCase,
    );
    let feedback = '';
    const subscription = store.feedback$.subscribe(value => { feedback = value; });
    store.load(); store.remove('A');
    expect(feedback).toBe(FavoriteMutationOutcome.Removed.label);
    subscription.unsubscribe(); store.ngOnDestroy();
  });
});
