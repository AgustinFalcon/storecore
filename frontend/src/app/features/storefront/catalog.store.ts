import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { catchError, forkJoin, of, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { CatalogQuery, emptyCatalogQuery } from '../../domain/catalog/catalog-query.entity';
import { HomeContent } from '../../domain/catalog/home-content.entity';
import { isApiOfferVisible, withoutClosedOfferBadge } from '../../domain/catalog/offer-window';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { ProductSummary } from '../../domain/catalog/product-summary.entity';
import { GetHomeUseCase } from '../../domain/catalog/use-cases/get-home.usecase';
import { GetProductUseCase } from '../../domain/catalog/use-cases/get-product.usecase';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { SearchCatalogUseCase } from '../../domain/catalog/use-cases/search-catalog.usecase';

export interface CatalogState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly query: CatalogQuery;
  readonly products: readonly ProductSummary[];
  readonly brands: readonly CatalogFacet[];
  readonly categories: readonly CatalogFacet[];
  readonly home: HomeContent | null;
  readonly offers: readonly ProductSummary[];
  readonly product: ProductDetail | null;
}

const INITIAL: CatalogState = {
  loading: false,
  errorMessage: '',
  query: emptyCatalogQuery,
  products: [],
  brands: [],
  categories: [],
  home: null,
  offers: [],
  product: null,
};

@Injectable()
export class CatalogStore extends ComponentStore<CatalogState> {
  constructor(
    private readonly searchCatalog: SearchCatalogUseCase,
    private readonly getHome: GetHomeUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly listFacets: ListCatalogFacetsUseCase,
  ) {
    super(INITIAL);
  }

  get snapshot(): CatalogState {
    return this.get((state) => state);
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly products$ = this.select((s) => s.products);
  readonly brands$ = this.select((s) => s.brands);
  readonly categories$ = this.select((s) => s.categories);
  readonly home$ = this.select((s) => s.home);
  readonly offers$ = this.select((s) => s.offers);
  readonly product$ = this.select((s) => s.product);
  readonly query$ = this.select((s) => s.query);
  readonly emptyProducts$ = this.select((s) => !s.loading && s.products.length === 0);

  readonly setQuery = this.updater((s, query: CatalogQuery) => ({ ...s, query }));

  readonly loadStorefront = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() => {
        let firstError = '';
        const remember = (err: unknown) => {
          firstError ||= getApiErrorMessage(err);
        };
        return forkJoin({
          home: this.getHome.execute().pipe(
            catchError((err: unknown) => {
              remember(err);
              return of(null);
            }),
          ),
          offers: this.searchCatalog.execute({ ...emptyCatalogQuery, offersOnly: true }).pipe(
            catchError((err: unknown) => {
              remember(err);
              return of([]);
            }),
          ),
          facets: this.listFacets.execute().pipe(
            catchError((err: unknown) => {
              remember(err);
              return of({ brands: [], categories: [] });
            }),
          ),
        }).pipe(
          tapResponse({
            next: ({ home, offers, facets }) => {
              const now = new Date();
              this.patchState({
                home,
                offers: offers.filter((product) => isApiOfferVisible(product.validFrom, product.validUntil, now)),
                brands: facets.brands,
                categories: facets.categories,
                loading: false,
                errorMessage: firstError,
              });
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        );
      }),
    ),
  );

  readonly loadHome = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.getHome.execute().pipe(
          tapResponse({
            next: (home) => this.patchState({ home, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
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
            next: (facets) => this.patchState({ brands: facets.brands, categories: facets.categories }),
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly search = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.searchCatalog.execute(this.snapshot.query).pipe(
          tapResponse({
            next: (products) => {
              const now = new Date();
              this.patchState({
                products: products.map((product) => withoutClosedOfferBadge(product, now)),
                loading: false,
              });
            },
            error: (err: unknown) => this.patchState({ loading: false, products: [], errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly loadProduct = this.effect<string>((sku$) =>
    sku$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '', product: null })),
      switchMap((sku) =>
        this.getProduct.execute(sku).pipe(
          tapResponse({
            next: (product) => this.patchState({ product: withoutClosedOfferBadge(product, new Date()), loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
