import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { filter, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { ManageAdminCatalogUseCase } from '../../domain/user/use-cases/manage-admin-catalog.usecase';

export interface AdminCatalogState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly products: readonly ProductDetail[];
  readonly brands: readonly CatalogFacet[];
  readonly categories: readonly CatalogFacet[];
  readonly draft: ProductDetail;
  readonly brandDraft: CatalogFacet;
  readonly categoryDraft: CatalogFacet;
}

export const emptyProductDraft: ProductDetail = {
  sku: '',
  name: '',
  description: '',
  brand: '',
  category: '',
  images: [],
  variants: [],
  price: { base: 0, desired: null, observed: null, effective: 0, priceVersion: '' },
  offerRef: null,
  active: true,
};

const emptyFacet: CatalogFacet = { id: '', name: '' };

@Injectable()
export class AdminCatalogStore extends ComponentStore<AdminCatalogState> {
  constructor(
    private readonly catalog: ManageAdminCatalogUseCase,
    private readonly facets: ListCatalogFacetsUseCase,
  ) {
    super({
      loading: false,
      errorMessage: '',
      products: [],
      brands: [],
      categories: [],
      draft: emptyProductDraft,
      brandDraft: emptyFacet,
      categoryDraft: emptyFacet,
    });
  }

  get snapshot(): AdminCatalogState {
    return this.get((s) => s);
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly products$ = this.select((s) => s.products);
  readonly brands$ = this.select((s) => s.brands);
  readonly categories$ = this.select((s) => s.categories);
  readonly empty$ = this.select((s) => !s.loading && s.products.length === 0);

  readonly setDraft = this.updater((s, draft: ProductDetail) => ({ ...s, draft }));
  readonly setBrandDraft = this.updater((s, brandDraft: CatalogFacet) => ({ ...s, brandDraft }));
  readonly setCategoryDraft = this.updater((s, categoryDraft: CatalogFacet) => ({ ...s, categoryDraft }));

  readonly load = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.catalog.list().pipe(
          tapResponse({
            next: (products) => this.patchState({ products, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly loadFacets = this.effect<void>((trigger$) =>
    trigger$.pipe(
      switchMap(() =>
        this.facets.execute().pipe(
          tapResponse({
            next: (items) => this.patchState({ brands: items.brands, categories: items.categories }),
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly persist = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.draft.sku.trim() || !this.snapshot.draft.name.trim()) {
          this.patchState({ loading: false, errorMessage: 'SKU y nombre son obligatorios.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.draft.sku.trim() && this.snapshot.draft.name.trim())),
      switchMap(() =>
        this.catalog.save(this.snapshot.draft).pipe(
          tapResponse({
            next: () => {
              this.patchState({ draft: emptyProductDraft });
              this.load();
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly persistBrand = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.brandDraft.id.trim() || !this.snapshot.brandDraft.name.trim()) {
          this.patchState({ errorMessage: 'Id y nombre de marca son obligatorios.' });
          return;
        }
        this.patchState({ errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.brandDraft.id.trim() && this.snapshot.brandDraft.name.trim())),
      switchMap(() =>
        this.catalog.saveBrand(this.snapshot.brandDraft).pipe(
          tapResponse({
            next: () => {
              this.patchState({ brandDraft: emptyFacet });
              this.loadFacets();
            },
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly persistCategory = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.categoryDraft.id.trim() || !this.snapshot.categoryDraft.name.trim()) {
          this.patchState({ errorMessage: 'Id y nombre de categoría son obligatorios.' });
          return;
        }
        this.patchState({ errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.categoryDraft.id.trim() && this.snapshot.categoryDraft.name.trim())),
      switchMap(() =>
        this.catalog.saveCategory(this.snapshot.categoryDraft).pipe(
          tapResponse({
            next: () => {
              this.patchState({ categoryDraft: emptyFacet });
              this.loadFacets();
            },
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
