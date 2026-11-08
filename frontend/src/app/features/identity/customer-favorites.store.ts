import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { concatMap, filter, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { FavoriteItem } from '../../domain/favorite/favorite';
import { AddFavoriteUseCase } from '../../domain/favorite/use-cases/add-favorite.usecase';
import { ListFavoritesUseCase } from '../../domain/favorite/use-cases/list-favorites.usecase';
import { RemoveFavoriteUseCase } from '../../domain/favorite/use-cases/remove-favorite.usecase';

export interface CustomerFavoritesState {
  readonly loading: boolean;
  readonly mutationSku: string;
  readonly items: readonly FavoriteItem[];
  readonly errorMessage: string;
  readonly feedback: string;
}

const INITIAL: CustomerFavoritesState = { loading: false, mutationSku: '', items: [], errorMessage: '', feedback: '' };

@Injectable()
export class CustomerFavoritesStore extends ComponentStore<CustomerFavoritesState> {
  readonly viewState$ = this.select((state) => state);
  readonly items$ = this.select((state) => state.items);
  readonly loading$ = this.select((state) => state.loading);
  readonly errorMessage$ = this.select((state) => state.errorMessage);
  readonly feedback$ = this.select((state) => state.feedback);

  constructor(
    private readonly listFavorites: ListFavoritesUseCase,
    private readonly addFavorite: AddFavoriteUseCase,
    private readonly removeFavorite: RemoveFavoriteUseCase,
  ) { super(INITIAL); }

  isFavorite(sku: string): boolean { return this.get((state) => state.items.some((item) => item.sku === sku)); }

  readonly load = this.effect<void>((trigger$) => trigger$.pipe(
    tap(() => this.patchState({ loading: true, errorMessage: '', feedback: '' })),
    switchMap(() => this.listFavorites.execute().pipe(tapResponse({
      next: (items) => this.patchState({ items, loading: false }),
      error: (error: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(error) }),
    }))),
  ));

  readonly add = this.effect<string>((sku$) => sku$.pipe(
    filter((sku) => Boolean(sku.trim())),
    tap((sku) => this.patchState({ mutationSku: sku, errorMessage: '', feedback: '' })),
    concatMap((sku) => this.addFavorite.execute(sku).pipe(tapResponse({
      next: (result) => {
        this.patchState({ mutationSku: '', feedback: result.outcome.label });
        if (result.outcome.accepted) this.load();
      },
      error: (error: unknown) => this.patchState({ mutationSku: '', errorMessage: getApiErrorMessage(error) }),
    }))),
  ));

  readonly remove = this.effect<string>((sku$) => sku$.pipe(
    filter((sku) => Boolean(sku.trim())),
    filter((sku) => this.get((state) => state.items.find((item) => item.sku === sku)?.availability.canRemove ?? false)),
    tap((sku) => this.patchState({ mutationSku: sku, errorMessage: '', feedback: '' })),
    concatMap((sku) => this.removeFavorite.execute(sku).pipe(tapResponse({
      next: (result) => {
        this.patchState((state) => ({
          mutationSku: '',
          feedback: result.outcome.label,
          items: result.outcome.accepted ? state.items.filter((item) => item.sku !== sku) : state.items,
        }));
      },
      error: (error: unknown) => this.patchState({ mutationSku: '', errorMessage: getApiErrorMessage(error) }),
    }))),
  ));
}
