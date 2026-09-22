import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { Health } from '../../domain/health/health.entity';
import { GetHealthUseCase } from '../../domain/health/use-cases/get-health.usecase';

export interface ShellState {
  readonly loading: boolean;
  readonly ready: boolean;
  readonly empty: boolean;
  readonly errorMessage: string;
  readonly apiStatus: string;
  readonly categories: readonly CatalogFacet[];
}

const INITIAL_STATE: ShellState = {
  loading: false,
  ready: false,
  empty: true,
  errorMessage: '',
  apiStatus: '',
  categories: [],
};

/**
 * Store del shell — mismo corte que EmployeeListStore:
 * Component → Store → UseCase → Repository HTTP.
 */
@Injectable()
export class ShellStore extends ComponentStore<ShellState> {
  constructor(
    private readonly getHealth: GetHealthUseCase,
    private readonly listFacets: ListCatalogFacetsUseCase,
  ) {
    super(INITIAL_STATE);
  }

  get snapshot(): ShellState {
    return this.get((state) => state);
  }

  readonly loading$ = this.select((state) => state.loading);
  readonly ready$ = this.select((state) => state.ready);
  readonly empty$ = this.select((state) => state.empty);
  readonly errorMessage$ = this.select((state) => state.errorMessage);
  readonly apiStatus$ = this.select((state) => state.apiStatus);
  readonly categories$ = this.select((state) => state.categories);

  readonly loadHealth = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.getHealth.execute().pipe(
          tapResponse({
            next: (health: Health) =>
              this.patchState({
                loading: false,
                ready: true,
                empty: true,
                errorMessage: '',
                apiStatus: health.status,
              }),
            error: (err: unknown) =>
              this.patchState({
                loading: false,
                ready: false,
                empty: true,
                errorMessage: getApiErrorMessage(err),
                apiStatus: '',
              }),
          }),
        ),
      ),
    ),
  );

  readonly loadFacets = this.effect<void>((trigger$) =>
    trigger$.pipe(
      switchMap(() =>
        this.listFacets.execute().pipe(
          tapResponse({
            next: ({ categories }) => this.patchState({ categories }),
            error: () => this.patchState({ categories: [] }),
          }),
        ),
      ),
    ),
  );
}
