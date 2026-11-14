import { BoundedPageRequest, boundedPageNavigation } from '../../domain/catalog/bounded-page';
import { ListMetadata } from '../../domain/catalog/bounded-rows';
import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { catchError, forkJoin, of, switchMap, tap, throwError } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { CatalogQuery, emptyCatalogQuery } from '../../domain/catalog/catalog-query.entity';
import { HomeComposition } from '../../domain/content/home-composition';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { ProductSummary, summarizeProduct } from '../../domain/catalog/product-summary.entity';
import { GetHomeUseCase } from '../../domain/catalog/use-cases/get-home.usecase';
import { GetProductUseCase } from '../../domain/catalog/use-cases/get-product.usecase';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { SearchCatalogUseCase } from '../../domain/catalog/use-cases/search-catalog.usecase';

export interface CatalogState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly query: CatalogQuery;
  readonly list: ListMetadata | null;
  readonly products: readonly ProductSummary[];
  readonly brands: readonly CatalogFacet[];
  readonly categories: readonly CatalogFacet[];
  readonly home: HomeComposition | null;
  readonly offers: readonly ProductSummary[];
  readonly product: ProductDetail | null;
  readonly queryDirty: boolean;
}

const INITIAL: CatalogState = {
  loading: false,
  errorMessage: '',
  query: emptyCatalogQuery,
  products: [], list: null,
  brands: [],
  categories: [],
  home: null,
  offers: [],
  product: null,
  queryDirty: false,
};

@Injectable()
export class CatalogStore extends ComponentStore<CatalogState> {
  private searchGeneration = 0;
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
  readonly viewState$ = this.select((s) => s);
  readonly emptyProducts$ = this.select((s) => !s.loading && !s.queryDirty && s.products.length === 0);

  setQuery(query: CatalogQuery): void {
    const previous = this.snapshot.query;
    const filtersChanged = previous.query !== query.query || previous.brand !== query.brand
      || previous.category !== query.category || previous.offersOnly !== query.offersOnly;
    this.searchGeneration += 1;
    this.patchState({ query: { ...query, pagination: filtersChanged ? BoundedPageRequest.first(query.pagination.size) : query.pagination },
      products: [], list: null, loading: false, errorMessage: '', queryDirty: filtersChanged || this.snapshot.queryDirty });
  }

  goToPage(page: number): void {
    const state = this.snapshot;
    if (state.loading || !state.list || !Number.isSafeInteger(page) || page < 0 || page > 10_000) return;
    const navigation = boundedPageNavigation(state.list);
    if (page >= navigation.totalPages || page === state.query.pagination.page) return;
    this.patchState({ query: { ...state.query, pagination: BoundedPageRequest.at(page, state.query.pagination.size) } });
    this.search();
  }

  readonly loadStorefront = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '', list: null })),
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
          facets: this.listFacets.execute().pipe(
            catchError((err: unknown) => {
              remember(err);
              return of({ brands: [], categories: [] });
            }),
          ),
        }).pipe(
          switchMap(({ home, facets }) => {
            const skus = [...new Set(home?.sections.flatMap(section => section.kind.referencesProducts ? section.content.skus ?? [] : []) ?? [])];
            const products = skus.map(sku => this.getProduct.execute(sku).pipe(
              switchMap(product => of(product.status.isPublic && (product.sku === sku || product.variants.some(variant => variant.sku === sku && variant.status.isPublic)) ? summarizeProduct(product, sku) : null)),
              catchError(() => of(null)),
            ));
            return (products.length ? forkJoin(products) : of([])).pipe(
              switchMap(rows => of({ home, facets, offers: rows.filter((row): row is ProductSummary => row !== null) })),
            );
          }),
          tapResponse({
            next: ({ home, offers, facets }) =>
              this.patchState({
                home,
                offers,
                brands: facets.brands,
                categories: facets.categories,
                loading: false,
                errorMessage: firstError,
              }),
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
      switchMap(() => {
        const generation = ++this.searchGeneration;
        const query = this.snapshot.query;
        this.patchState({ loading: true, errorMessage: '', products: [], queryDirty: false });
        return this.searchCatalog.execute(query).pipe(
          switchMap(products => {
            if (generation !== this.searchGeneration) return of(null);
            const recoveryPage = boundedPageNavigation(products.metadata).recoveryPage;
            if (products.length || recoveryPage === null) return of(products);
            const recovered = { ...query, pagination: BoundedPageRequest.at(recoveryPage, query.pagination.size) };
            this.patchState({ query: recovered });
            // Recover once; a second concurrent shrink must not create a request loop.
            return this.searchCatalog.execute(recovered).pipe(
              switchMap(retried => !retried.length && boundedPageNavigation(retried.metadata).recoveryPage !== null
                ? throwError(() => new Error('La lista cambió nuevamente. Volvé a intentar.'))
                : of(retried)),
            );
          }),
          tapResponse({
            next: (products) => {
              if (generation !== this.searchGeneration || products === null) return;
              this.patchState({ products, list: products.metadata, loading: false });
            },
            error: (err: unknown) => {
              if (generation !== this.searchGeneration) return;
              this.patchState({ loading: false, products: [], list: null, errorMessage: getApiErrorMessage(err) });
            },
          }),
        );
      }),
    ),
  );

  readonly loadProduct = this.effect<string>((sku$) =>
    sku$.pipe(
      tap((sku) => {
        const current = this.snapshot.product;
        const sameProduct = current && (current.sku === sku || current.variants.some((variant) => variant.sku === sku));
        this.patchState({ loading: true, errorMessage: '', product: sameProduct ? current : null });
      }),
      switchMap((sku) =>
        this.getProduct.execute(sku).pipe(
          tapResponse({
            next: (product) => this.patchState({ product: product.status.isPublic ? { ...product, variants: product.variants.filter(variant => variant.status.isPublic) } : null, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
