import { BoundedPageRequest, boundedPageNavigation } from '../../domain/catalog/bounded-page';
import { UserRole } from '../../domain/user/user-role';
import { UserSessionResult } from '../../domain/user/user.entity';
import { ListMetadata } from '../../domain/catalog/bounded-rows';
import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { EMPTY, Subject, filter, switchMap, tap, takeUntil, of, throwError, map } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { CatalogProductDraft, catalogProductDraftFromDetail, newCatalogProductDraft } from '../../domain/catalog/catalog-product-draft';
import { isArsAmount } from '../../domain/catalog/variant-price';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { ManageAdminCatalogUseCase } from '../../domain/user/use-cases/manage-admin-catalog.usecase';

export interface AdminCatalogState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly list: ListMetadata | null;
  readonly products: readonly ProductDetail[];
  readonly brands: readonly CatalogFacet[];
  readonly categories: readonly CatalogFacet[];
  readonly draft: CatalogProductDraft;
  readonly brandDraft: CatalogFacet;
  readonly categoryDraft: CatalogFacet;
}

const emptyFacet: CatalogFacet = { id: '', name: '' };

@Injectable()
export class AdminCatalogStore extends ComponentStore<AdminCatalogState> {
  private actorKey: string | null = null;
  private generation = 0;
  private page = BoundedPageRequest.first();
  private readonly actorChanged = new Subject<void>();

  setActor(principal: UserSessionResult | null): boolean {
    const roles = principal?.roles.filter(role => role === UserRole.Admin || role === UserRole.Operator) ?? [];
    const actorKey = principal?.id.trim() && roles.length ? JSON.stringify([principal.id, roles.map(role => role.wire).sort()]) : null;
    if (actorKey === this.actorKey) return false;
    this.actorKey = actorKey; this.generation++; this.actorChanged.next(); this.page = BoundedPageRequest.first();
    this.patchState({ loading: false, errorMessage: '', products: [], list: null, brands: [], categories: [], draft: newCatalogProductDraft(), brandDraft: emptyFacet, categoryDraft: emptyFacet });
    return true;
  }

  goToPage(page: number): void {
    if (this.snapshot.loading || !this.snapshot.list) return;
    const navigation = boundedPageNavigation(this.snapshot.list);
    if (page !== navigation.page - 1 && page !== navigation.page + 1 || page < 0 || page >= navigation.totalPages) return;
    this.page = BoundedPageRequest.at(page); this.load();
  }

  constructor(
    private readonly catalog: ManageAdminCatalogUseCase,
    private readonly facets: ListCatalogFacetsUseCase,
  ) {
    super({
      loading: false,
      errorMessage: '',
      products: [], list: null,
      brands: [],
      categories: [],
      draft: newCatalogProductDraft(),
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

  readonly setDraft = this.updater((s, draft: CatalogProductDraft) => s.loading ? s : ({ ...s, draft }));
  readonly beginCreate = this.updater((s) => s.loading ? s : ({ ...s, errorMessage: '', draft: newCatalogProductDraft() }));
  readonly beginEdit = this.updater((s, product: ProductDetail) => s.loading ? s : ({ ...s, errorMessage: '', draft: catalogProductDraftFromDetail(product) }));
  readonly setEditError = this.updater((s, errorMessage: string) => ({ ...s, errorMessage }));
  readonly setBrandDraft = this.updater((s, brandDraft: CatalogFacet) => ({ ...s, brandDraft }));
  readonly setCategoryDraft = this.updater((s, categoryDraft: CatalogFacet) => ({ ...s, categoryDraft }));

  readonly load = this.effect<void>(trigger$ => trigger$.pipe(switchMap(() => {
    if (!this.actorKey) return EMPTY;
    const generation = ++this.generation;
    const requested = this.page;
    this.patchState({ loading: true, errorMessage: '', products: [] });
    return this.catalog.list(requested).pipe(
      switchMap(products => {
        const recovery = boundedPageNavigation(products.metadata).recoveryPage;
        if (!products.length && recovery !== null) {
          this.page = BoundedPageRequest.at(recovery, requested.size);
          return this.catalog.list(this.page).pipe(
            switchMap(retried => !retried.length && boundedPageNavigation(retried.metadata).recoveryPage !== null
              ? throwError(() => new Error('La lista cambió nuevamente. Volvé a intentar.'))
              : of(retried)),
          );
        }
        return of(products);
      }),
      takeUntil(this.actorChanged),
      tapResponse({
        next: products => { if (generation === this.generation) this.patchState({ products, list: products.metadata, loading: false }); },
        error: (error: unknown) => { if (generation === this.generation) this.patchState({ loading: false, errorMessage: getApiErrorMessage(error) }); },
      }),
    );
  })));

  readonly loadFacets = this.effect<void>((trigger$) =>
    trigger$.pipe(
      filter(() => !!this.actorKey),
      switchMap(() =>
        this.facets.execute().pipe(
          takeUntil(this.actorChanged),
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
      filter(() => !!this.actorKey && !this.snapshot.loading),
      tap(() => {
        if (!this.validPrices()) this.patchState({ errorMessage: 'Informá precios ARS válidos, no negativos y con hasta dos decimales.' });
      }),
      filter(() => this.validPrices()),
      tap(() => {
        const draft = this.snapshot.draft;
        const invalidVariant = draft.variants.some(variant =>
          !variant.sku.trim() || !variant.name.trim() || !variant.status.canPersist ||
          (!variant.id && (variant.initialAvailableQuantity === null || !Number.isSafeInteger(variant.initialAvailableQuantity) || variant.initialAvailableQuantity < 0)) ||
          Object.keys(variant.attributes).some(key => !key.trim()),
        );
        if (!draft.sku.trim() || !draft.name.trim() || invalidVariant) {
          this.patchState({ loading: false, errorMessage: invalidVariant
            ? 'Cada variante necesita SKU, nombre, estado conocido, atributos válidos y stock inicial entero no negativo cuando es nueva.'
            : 'SKU y nombre son obligatorios.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => {
        const draft = this.snapshot.draft;
        return Boolean(draft.sku.trim() && draft.name.trim() && draft.variants.every(variant =>
          variant.sku.trim() && variant.name.trim() && variant.status.canPersist &&
          (variant.id.trim() || variant.initialAvailableQuantity !== null && Number.isSafeInteger(variant.initialAvailableQuantity) && variant.initialAvailableQuantity >= 0) &&
          Object.keys(variant.attributes).every(key => key.trim()),
        ));
      }),
      map(() => this.snapshot.draft),
      switchMap(submittedDraft =>
        this.catalog.save(submittedDraft).pipe(
          takeUntil(this.actorChanged),
          tapResponse({
            next: () => {
              if (this.snapshot.draft === submittedDraft) this.patchState({ draft: newCatalogProductDraft() });
              this.load();
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  private validPrices(): boolean {
    const draft = this.snapshot.draft;
    return isArsAmount(draft.productBasePrice) && draft.variants.every(variant => variant.priceCommand.known
      && (!variant.priceCommand.requiresBase || isArsAmount(variant.priceInput)));
  }

  readonly persistBrand = this.effect<void>((trigger$) =>
    trigger$.pipe(
      filter(() => !!this.actorKey),
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
          takeUntil(this.actorChanged),
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
      filter(() => !!this.actorKey),
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
          takeUntil(this.actorChanged),
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
