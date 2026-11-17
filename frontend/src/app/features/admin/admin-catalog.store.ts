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
import { CatalogQuery, emptyCatalogQuery } from '../../domain/catalog/catalog-query.entity';
import { DomainReadonlyMap, OptionResolutionCause, OptionSchemaState } from '../../domain/catalog/option-schema';
import { AdminProductOptionsSnapshot, ProductOptionsAuthorityObservation } from '../../domain/catalog/admin-product-options';
import { VariantStatus } from '../../domain/catalog/catalog-states';

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
  readonly query: CatalogQuery;
  readonly queryDirty: boolean;
}

const emptyFacet: CatalogFacet = { id: '', name: '' };

@Injectable()
export class AdminCatalogStore extends ComponentStore<AdminCatalogState> {
  private actorKey: string | null = null;
  private generation = 0;
  private readonly verifiedOptionsBySku = new Map<string, AdminProductOptionsSnapshot>();
  private readonly optionRevisionHighwaterBySku = new Map<string, number>();
  private readonly unverifiableOptionSkus = new Set<string>();
  private readonly actorChanged = new Subject<void>();

  setActor(principal: UserSessionResult | null): boolean {
    const roles = principal?.roles.filter(role => role === UserRole.Admin || role === UserRole.Operator) ?? [];
    const actorKey = principal?.id.trim() && roles.length ? JSON.stringify([principal.id, roles.map(role => role.wire).sort()]) : null;
    if (actorKey === this.actorKey) return false;
    this.actorKey = actorKey; this.generation++; this.actorChanged.next();
    this.verifiedOptionsBySku.clear();
    this.optionRevisionHighwaterBySku.clear(); this.unverifiableOptionSkus.clear();
    this.patchState({ loading: false, errorMessage: '', products: [], list: null, brands: [], categories: [], draft: newCatalogProductDraft(), brandDraft: emptyFacet, categoryDraft: emptyFacet, query: emptyCatalogQuery, queryDirty: false });
    return true;
  }

  goToPage(page: number): void {
    if (this.snapshot.loading || !this.snapshot.list) return;
    const navigation = boundedPageNavigation(this.snapshot.list);
    if (page !== navigation.page - 1 && page !== navigation.page + 1 || page < 0 || page >= navigation.totalPages) return;
    this.patchState({ query: { ...this.snapshot.query, pagination: BoundedPageRequest.at(page, this.snapshot.query.pagination.size) } }); this.load();
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
      query: emptyCatalogQuery,
      queryDirty: false,
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

  setQuery(query: CatalogQuery): void {
    this.generation++;
    this.patchState({ query: { ...query, pagination: BoundedPageRequest.first(query.pagination.size) }, products: [], list: null, loading: false, queryDirty: true, errorMessage: '' });
  }

  readonly setDraft = this.updater((s, draft: CatalogProductDraft) => s.loading ? s : ({ ...s, draft }));
  readonly beginCreate = this.updater((s) => s.loading ? s : ({ ...s, errorMessage: '', draft: newCatalogProductDraft() }));
  readonly beginEdit = this.updater((s, product: ProductDetail) => s.loading ? s : ({ ...s, errorMessage: '', draft: catalogProductDraftFromDetail(product) }));
  readonly syncOptionSnapshot = this.updater((s, verified: ProductOptionsAuthorityObservation) => {
    const productRevision = s.products.find(product => product.sku === verified.sku)?.optionSnapshot.schema.revision?.value ?? 0;
    const draftRevision = s.draft.sku === verified.sku ? s.draft.optionSchemaRevision ?? 0 : 0;
    const cachedRevision = this.verifiedOptionsBySku.get(verified.sku)?.revision ?? 0;
    const highwater = Math.max(productRevision, draftRevision, cachedRevision, this.optionRevisionHighwaterBySku.get(verified.sku) ?? 0, verified.minimumRevision);
    if (verified.state === OptionSchemaState.Unknown) {
      this.optionRevisionHighwaterBySku.set(verified.sku, highwater); this.unverifiableOptionSkus.add(verified.sku);
      this.verifiedOptionsBySku.delete(verified.sku);
      const unknownSchema = verified.snapshot?.schema ?? Object.freeze({ revision: null, state: OptionSchemaState.Unknown,
        cause: OptionResolutionCause.Unknown, axes: Object.freeze([]) });
      const unknownOptionSnapshot = Object.freeze({ schema: unknownSchema, variants: Object.freeze([]) });
      return { ...s,
        products: s.products.map(product => product.sku === verified.sku ? { ...product, optionSnapshot: unknownOptionSnapshot } : product),
        draft: s.draft.sku === verified.sku ? { ...s.draft, optionSchemaState: OptionSchemaState.Unknown,
          optionSchemaRevision: highwater || s.draft.optionSchemaRevision } : s.draft };
    }
    const snapshot = verified.snapshot; if (!snapshot || snapshot.revision < highwater) return s;
    this.optionRevisionHighwaterBySku.set(verified.sku, Math.max(highwater, snapshot.revision)); this.unverifiableOptionSkus.delete(verified.sku);
    this.verifiedOptionsBySku.set(verified.sku, snapshot);
    return {
      ...s,
      products: s.products.map(product => product.sku === verified.sku ? this.withVerifiedOptions(product, snapshot) : product),
      draft: s.draft.sku === verified.sku ? this.withVerifiedDraft(s.draft, snapshot) : s.draft,
    };
  });
  readonly setEditError = this.updater((s, errorMessage: string) => ({ ...s, errorMessage }));
  readonly setBrandDraft = this.updater((s, brandDraft: CatalogFacet) => ({ ...s, brandDraft }));
  readonly setCategoryDraft = this.updater((s, categoryDraft: CatalogFacet) => ({ ...s, categoryDraft }));

  readonly load = this.effect<void>(trigger$ => trigger$.pipe(switchMap(() => {
    if (!this.actorKey) return EMPTY;
    const generation = ++this.generation;
    const requested = this.snapshot.query;
    this.patchState({ loading: true, errorMessage: '', products: [], queryDirty: false });
    return this.catalog.list(requested).pipe(
      switchMap(products => {
        if (generation !== this.generation) return EMPTY;
        const recovery = boundedPageNavigation(products.metadata).recoveryPage;
        if (!products.length && recovery !== null) {
          const recovered = { ...requested, pagination: BoundedPageRequest.at(recovery, requested.pagination.size) };
          this.patchState({ query: recovered });
          return this.catalog.list(recovered).pipe(
            switchMap(retried => !retried.length && boundedPageNavigation(retried.metadata).recoveryPage !== null
              ? throwError(() => new Error('La lista cambió nuevamente. Volvé a intentar.'))
              : of(retried)),
          );
        }
        return of(products);
      }),
      takeUntil(this.actorChanged),
      tapResponse({
        next: products => { if (generation === this.generation) {
          const synchronizedProducts = products.map(product => {
          const serverRevision = product.optionSnapshot.schema.revision?.value;
          const highwater = this.optionRevisionHighwaterBySku.get(product.sku) ?? 0;
          if (product.optionSnapshot.schema.state === OptionSchemaState.Unknown) {
            this.verifiedOptionsBySku.delete(product.sku); this.unverifiableOptionSkus.add(product.sku); return product;
          }
          if (this.unverifiableOptionSkus.has(product.sku) && (serverRevision ?? 0) <= highwater) return this.withUnknownOptions(product);
          if (serverRevision !== undefined && serverRevision !== null && serverRevision > highwater) {
            this.optionRevisionHighwaterBySku.set(product.sku, serverRevision); this.unverifiableOptionSkus.delete(product.sku);
          }
          const verified = this.verifiedOptionsBySku.get(product.sku);
          if (!verified) return product;
          if (serverRevision !== undefined && serverRevision !== null && serverRevision >= verified.revision) {
            this.verifiedOptionsBySku.delete(product.sku); return product;
          }
          return this.withVerifiedOptions(product, verified);
          });
          const currentDraft = this.snapshot.draft, listedDraft = synchronizedProducts.find(product => product.sku === currentDraft.sku);
          this.patchState({ products: synchronizedProducts, draft: listedDraft ? this.withListedDraft(currentDraft, listedDraft) : currentDraft,
            list: products.metadata, loading: false });
        } },
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

  private withVerifiedOptions(product: ProductDetail, snapshot: AdminProductOptionsSnapshot): ProductDetail {
    const activity = new Map(snapshot.assignments.map(assignment => [assignment.variantId, assignment.active]));
    const optionSnapshot = Object.freeze({ schema: snapshot.schema, variants: Object.freeze(snapshot.assignments.map(assignment => Object.freeze({
      variantId: assignment.variantId, sku: assignment.variantSku, values: new DomainReadonlyMap(assignment.optionValues),
    }))) });
    return { ...product, optionSnapshot, variants: product.variants.map(variant => {
      const active = activity.get(variant.id);
      return active === undefined ? variant : { ...variant, status: active ? VariantStatus.Active : VariantStatus.Inactive };
    }) };
  }

  private withUnknownOptions(product: ProductDetail): ProductDetail {
    return { ...product, optionSnapshot: Object.freeze({ schema: Object.freeze({ revision: null, state: OptionSchemaState.Unknown,
      cause: OptionResolutionCause.Unknown, axes: Object.freeze([]) }), variants: Object.freeze([]) }) };
  }

  private withVerifiedDraft(draft: CatalogProductDraft, snapshot: AdminProductOptionsSnapshot): CatalogProductDraft {
    const samePublishedRevision = draft.optionSchemaRevision !== null && snapshot.revision <= draft.optionSchemaRevision
      && draft.optionSchemaState === snapshot.schema.state;
    if (samePublishedRevision) return { ...draft, optionSchemaState: snapshot.schema.state, optionSchemaRevision: Math.max(draft.optionSchemaRevision!, snapshot.revision) };
    const statuses = new Map(snapshot.assignments.map(assignment => [assignment.variantId, assignment.active ? VariantStatus.Active : VariantStatus.Inactive]));
    return this.reconcileDraft(draft, snapshot.schema.state, snapshot.revision, statuses);
  }

  private withListedDraft(draft: CatalogProductDraft, product: ProductDetail): CatalogProductDraft {
    const schema = product.optionSnapshot.schema;
    if (schema.state === OptionSchemaState.Unknown) return { ...draft, optionSchemaState: OptionSchemaState.Unknown };
    const revision = schema.revision?.value;
    if (revision === undefined || revision === null || draft.optionSchemaRevision !== null && revision <= draft.optionSchemaRevision) return draft;
    return this.reconcileDraft(draft, schema.state, revision, new Map(product.variants.map(variant => [variant.id, variant.status])));
  }

  private reconcileDraft(draft: CatalogProductDraft, state: OptionSchemaState, revision: number,
    published: ReadonlyMap<string, VariantStatus>): CatalogProductDraft {
    const preserveIndependentAbsentDelta = draft.optionSchemaState === OptionSchemaState.Absent && state === OptionSchemaState.Absent;
    return { ...draft, optionSchemaState: state, optionSchemaRevision: revision,
      variantPublishedStatuses: new DomainReadonlyMap(published), variants: draft.variants.map(variant => {
        if (!variant.id) return state.allowsGeneric ? variant : { ...variant, status: VariantStatus.Inactive };
        const remote = published.get(variant.id); if (!remote) return variant;
        const previous = draft.variantPublishedStatuses.get(variant.id);
        const localChanged = previous !== undefined && variant.status !== previous;
        const remoteChanged = previous !== undefined && remote !== previous;
        return preserveIndependentAbsentDelta && localChanged && !remoteChanged ? variant : { ...variant, status: remote };
      }) };
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
