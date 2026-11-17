import { UserRole } from '../../domain/user/user-role';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, Subject } from 'rxjs';
import { mapAdminProductDetails as mapProductDetails } from '../../data/mappers/http-mappers';
import { ManageAdminCatalogUseCase } from '../../domain/user/use-cases/manage-admin-catalog.usecase';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { AdminCatalogStore } from './admin-catalog.store';
import { UserCatalogViewComponent } from './user-catalog.view';
import { catalogProductDraftFromDetail, newCatalogProductDraft } from '../../domain/catalog/catalog-product-draft';
import { emptyCatalogQuery } from '../../domain/catalog/catalog-query.entity';
import { VariantStatus } from '../../domain/catalog/catalog-states';
import { AdminProductOptionsMapper } from '../../domain/catalog/admin-product-options';
import { OptionSchemaState } from '../../domain/catalog/option-schema';

describe('bounded administrative catalog', () => {
  it('keeps one product with multiple variants, closed statuses and exact partial totals', async () => {
    const products = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Producto', status: 'ARCHIVED', price: { base: 10, original: 10, effective: 10 },
      variants: ['A', 'B'].map(id => ({ id, sku: id, name: id, status: 'INACTIVE', availability: 'UNAVAILABLE', attributes: { Material: 'Acero', Color: 'Negro' }, inventory: { sku: id, state: 'MISSING', available: null, reserved: null, safety: null, onHand: null, saleable: null } })) }], total: 120, page: 0, size: 50, truncated: true });
    const store = new AdminCatalogStore({ list: () => of(products) } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor({ id: 'actor', roles: [UserRole.Admin] });
    store.load(); store.beginEdit(products[0]);
    expect(store.snapshot.products).toHaveLength(1);
    expect(store.snapshot.list?.total).toBe(120);
    TestBed.configureTestingModule({ imports: [UserCatalogViewComponent] });
    const fixture = TestBed.createComponent(UserCatalogViewComponent);
    fixture.componentRef.setInput('state', { ...store.snapshot, draft: catalogProductDraftFromDetail(products[0]) }); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Archivado');
    expect(fixture.nativeElement.textContent).toContain('Lectura parcial');
    expect(Array.from(fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>)
      .map(input => input.value).filter(value => value === 'Material' || value === 'Color')).toEqual(['Material', 'Color', 'Material', 'Color']);
    store.ngOnDestroy();
  });

  it('edits existing variant presentation and attributes without changing identity or SKU', async () => {
    const product = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Producto', status: 'ACTIVE', productBasePrice: 10, price: { base: 10, original: 10, effective: 10 },
      variants: [{ id: 'variant-id', sku: 'VAR-1', name: 'Original', status: 'ACTIVE', availability: 'AVAILABLE', attributes: { Color: 'Negro' }, inventory: { sku: 'VAR-1', state: 'KNOWN', available: 2, reserved: 0, safety: 0, onHand: 2, saleable: 2 } }] }], total: 1, page: 0, size: 50, truncated: false })[0];
    TestBed.configureTestingModule({ imports: [UserCatalogViewComponent] });
    const fixture = TestBed.createComponent(UserCatalogViewComponent);
    fixture.componentRef.setInput('state', { loading: false, errorMessage: '', list: null, products: [], brands: [], categories: [], draft: catalogProductDraftFromDetail(product), brandDraft: { id: '', name: '' }, categoryDraft: { id: '', name: '' }, query: emptyCatalogQuery, queryDirty: false });

    const renamedEvent = firstValueFrom(fixture.componentInstance.draftChange);
    fixture.componentInstance.patchVariant(0, { name: 'Renombrada' });
    const renamed = await renamedEvent;
    expect(renamed.variants[0]).toEqual(expect.objectContaining({ id: 'variant-id', sku: 'VAR-1', name: 'Renombrada' }));

    fixture.componentRef.setInput('state', { ...fixture.componentInstance.state, draft: renamed });
    const keyEvent = firstValueFrom(fixture.componentInstance.draftChange);
    fixture.componentInstance.patchAttributeKey(0, 0, 'Tono');
    const renamedAttribute = await keyEvent;
    fixture.componentRef.setInput('state', { ...fixture.componentInstance.state, draft: renamedAttribute });
    const valueEvent = firstValueFrom(fixture.componentInstance.draftChange);
    fixture.componentInstance.patchAttributeValue(0, 0, 'Grafito');
    const attributed = await valueEvent;
    expect(attributed.variants[0].attributes).toEqual({ Tono: 'Grafito' });
  });

  it('routes variant activity to the option editor when the product has a valid schema', async () => {
    const product = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Producto', status: 'ACTIVE', productBasePrice: 10,
      optionSchema: { revision: 1, state: 'VALID', cause: null, axes: [{ code: 'color', label: 'Color', presentation: 'SELECT', order: 0, values: [{ code: 'red', label: 'Rojo', order: 0, swatchColor: null }] }] },
      variants: [{ id: 'variant-id', sku: 'VAR-1', name: 'Original', status: 'ACTIVE', availability: 'AVAILABLE', optionValues: { color: 'red' }, attributes: {}, inventory: { sku: 'VAR-1', state: 'KNOWN', available: 2, reserved: 0, safety: 0, onHand: 2, saleable: 2 } }] }], total: 1, page: 0, size: 50, truncated: false })[0];
    TestBed.configureTestingModule({ imports: [UserCatalogViewComponent] });
    const fixture = TestBed.createComponent(UserCatalogViewComponent);
    fixture.componentRef.setInput('state', { loading: false, errorMessage: '', list: null, products: [product], brands: [], categories: [], draft: catalogProductDraftFromDetail(product), brandDraft: { id: '', name: '' }, categoryDraft: { id: '', name: '' }, query: emptyCatalogQuery, queryDirty: false });
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const disabledSelects = Array.from(fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>).filter(select => select.disabled);
    expect(disabledSelects).toHaveLength(1);
    expect(disabledSelects[0].value).toBe('ACTIVE');
    const draftEmit = vi.spyOn(fixture.componentInstance.draftChange, 'emit');
    fixture.componentInstance.setVariantStatus(0, 'INACTIVE');
    expect(draftEmit).not.toHaveBeenCalled();
    const additionEvent = firstValueFrom(fixture.componentInstance.draftChange);
    fixture.componentInstance.addVariant();
    expect((await additionEvent).variants.at(-1)?.status).toBe(VariantStatus.Inactive);
    const optionsEvent = firstValueFrom(fixture.componentInstance.editOptions);
    fixture.componentInstance.configureDraftOptions();
    expect(await optionsEvent).toBe(product.sku);
  });

  it('synchronizes verified option transitions without discarding the open product draft', () => {
    const products = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Original', status: 'ACTIVE', productBasePrice: 10,
      optionSchema: { revision: 1, state: 'ABSENT', cause: null, axes: [] },
      variants: [{ id: 'variant-id', sku: 'VAR-1', name: 'Original', status: 'ACTIVE', availability: 'AVAILABLE', optionValues: {}, attributes: {}, inventory: { sku: 'VAR-1', state: 'KNOWN', available: 2, reserved: 0, safety: 0, onHand: 2, saleable: 2 } }] }], total: 1, page: 0, size: 50, truncated: false });
    const product = products[0], lateList = new Subject<typeof products>(), newerList = new Subject<typeof products>();
    const list = vi.fn().mockReturnValueOnce(of(products)).mockReturnValueOnce(lateList).mockReturnValueOnce(newerList);
    const store = new AdminCatalogStore({ list } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor({ id: 'actor', roles: [UserRole.Admin] }); store.load(); store.beginEdit(product);
    store.setDraft({ ...store.snapshot.draft, name: 'Edición sin publicar', variants: [{ ...store.snapshot.draft.variants[0], status: VariantStatus.Inactive },
      { ...newCatalogProductDraft().variants[0], sku: 'NEW', name: 'Nueva', status: VariantStatus.Active }] });
    const unchangedAbsent = AdminProductOptionsMapper.fromWire({ revision: 1, state: 'ABSENT', cause: null, axes: [],
      assignments: [{ variantId: 'variant-id', variantSku: 'VAR-1', active: true, optionValues: {} }] });
    store.syncOptionSnapshot({ sku: 'SKU', snapshot: unchangedAbsent });
    expect(store.snapshot.draft.variants.map(variant => variant.status)).toEqual([VariantStatus.Inactive, VariantStatus.Active]);
    const independentRemote = AdminProductOptionsMapper.fromWire({ revision: 2, state: 'ABSENT', cause: null, axes: [],
      assignments: [{ variantId: 'variant-id', variantSku: 'VAR-1', active: true, optionValues: {} },
        { variantId: 'remote-b', variantSku: 'REMOTE-B', active: false, optionValues: {} }] });
    store.syncOptionSnapshot({ sku: 'SKU', snapshot: independentRemote });
    expect(store.snapshot.draft.variants[0].status).toBe(VariantStatus.Inactive);
    expect(store.snapshot.draft.variantPublishedStatuses.get('remote-b')).toBe(VariantStatus.Inactive);
    store.load();
    const valid = AdminProductOptionsMapper.fromWire({ revision: 3, state: 'VALID', cause: null,
      axes: [{ code: 'color', label: 'Color', presentation: 'SELECT', order: 0, values: [{ code: 'red', label: 'Rojo', order: 0, swatchColor: null }] }],
      assignments: [{ variantId: 'variant-id', variantSku: 'VAR-1', active: false, optionValues: {} }] });
    store.syncOptionSnapshot({ sku: 'SKU', snapshot: valid });
    expect(store.snapshot.draft.name).toBe('Edición sin publicar');
    expect(store.snapshot.draft.optionSchemaState).toBe(OptionSchemaState.Valid);
    expect(store.snapshot.draft.variants.map(variant => variant.status)).toEqual([VariantStatus.Inactive, VariantStatus.Inactive]);
    expect(store.snapshot.products).toHaveLength(0);
    lateList.next(products); lateList.complete();
    expect(store.snapshot.products[0].optionSnapshot.schema.state).toBe(OptionSchemaState.Valid);
    expect(store.snapshot.products[0].variants[0].status).toBe(VariantStatus.Inactive);
    expect(store.snapshot.products[0].optionSnapshot.schema.state).toBe(OptionSchemaState.Valid);
    const absent = AdminProductOptionsMapper.fromWire({ revision: 4, state: 'ABSENT', cause: null, axes: [],
      assignments: [{ variantId: 'variant-id', variantSku: 'VAR-1', active: false, optionValues: {} }] });
    store.syncOptionSnapshot({ sku: 'SKU', snapshot: absent });
    expect(store.snapshot.draft.name).toBe('Edición sin publicar');
    expect(store.snapshot.draft.optionSchemaState).toBe(OptionSchemaState.Absent);
    expect(store.snapshot.draft.variants[0].status).toBe(VariantStatus.Inactive);
    expect(store.snapshot.products[0].optionSnapshot.schema.state).toBe(OptionSchemaState.Absent);
    const newerProducts = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Servidor nuevo', status: 'ACTIVE', productBasePrice: 10,
      optionSchema: { revision: 5, state: 'ABSENT', cause: null, axes: [] },
      variants: [{ id: 'variant-id', sku: 'VAR-1', name: 'Original', status: 'ACTIVE', availability: 'AVAILABLE', optionValues: {}, attributes: {}, inventory: { sku: 'VAR-1', state: 'KNOWN', available: 2, reserved: 0, safety: 0, onHand: 2, saleable: 2 } }] }], total: 1, page: 0, size: 50, truncated: false });
    store.load(); newerList.next(newerProducts); newerList.complete();
    expect(store.snapshot.products[0].optionSnapshot.schema.revision?.value).toBe(5);
    expect(store.snapshot.products[0].variants[0].status).toBe(VariantStatus.Active);
    expect(store.snapshot.draft.optionSchemaRevision).toBe(5);
    expect(store.snapshot.draft.variants[0].status).toBe(VariantStatus.Active);
    store.syncOptionSnapshot({ sku: 'SKU', snapshot: unchangedAbsent });
    expect(store.snapshot.draft.optionSchemaRevision).toBe(5);
    expect(store.snapshot.draft.variants[0].status).toBe(VariantStatus.Active);
    const unknown = AdminProductOptionsMapper.fromWire({ revision: 99, state: 'FUTURE', axes: [], assignments: [] });
    store.syncOptionSnapshot({ sku: 'SKU', snapshot: unknown });
    expect(store.snapshot.draft.optionSchemaState).toBe(OptionSchemaState.Unknown);
    store.ngOnDestroy();
  });

  it('preserves untouched JSON attribute types and rejects duplicate key collisions', async () => {
    const product = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Producto', status: 'ACTIVE', productBasePrice: 10, price: { base: 10, original: 10, effective: 10 },
      variants: [{ id: 'variant-id', sku: 'VAR-1', name: 'Original', status: 'ACTIVE', availability: 'AVAILABLE', attributes: { Weight: 2, Enabled: true, Nested: { a: 1 }, Color: 'Negro' }, inventory: { sku: 'VAR-1', state: 'KNOWN', available: 2, reserved: 0, safety: 0, onHand: 2, saleable: 2 } }] }], total: 1, page: 0, size: 50, truncated: false })[0];
    TestBed.configureTestingModule({ imports: [UserCatalogViewComponent] });
    const fixture = TestBed.createComponent(UserCatalogViewComponent);
    fixture.componentRef.setInput('state', { loading: false, errorMessage: '', list: null, products: [product], brands: [], categories: [], draft: catalogProductDraftFromDetail(product), brandDraft: { id: '', name: '' }, categoryDraft: { id: '', name: '' }, query: emptyCatalogQuery, queryDirty: false });

    const valueEvent = firstValueFrom(fixture.componentInstance.draftChange);
    fixture.componentInstance.patchAttributeValue(0, 3, 'Azul');
    const changed = await valueEvent;
    expect(changed.variants[0].attributes).toEqual({ Weight: 2, Enabled: true, Nested: { a: 1 }, Color: 'Azul' });

    fixture.componentRef.setInput('state', { ...fixture.componentInstance.state, draft: changed });
    const draftEmit = vi.spyOn(fixture.componentInstance.draftChange, 'emit');
    const errorEvent = firstValueFrom(fixture.componentInstance.editError);
    fixture.componentInstance.patchAttributeKey(0, 0, 'Color');
    expect(await errorEvent).toContain('ya existe');
    expect(draftEmit).not.toHaveBeenCalled();
  });

  it('uses the closed product status to archive without deleting commercial history', async () => {
    const draft = newCatalogProductDraft();
    TestBed.configureTestingModule({ imports: [UserCatalogViewComponent] });
    const fixture = TestBed.createComponent(UserCatalogViewComponent);
    fixture.componentRef.setInput('state', { loading: false, errorMessage: '', list: null, products: [], brands: [], categories: [], draft, brandDraft: { id: '', name: '' }, categoryDraft: { id: '', name: '' }, query: emptyCatalogQuery, queryDirty: false });
    const statusEvent = firstValueFrom(fixture.componentInstance.draftChange);
    fixture.componentInstance.setProductStatus('ARCHIVED');
    expect((await statusEvent).status.label).toBe('Archivado');
  });

  it('accumulates rapid monetary edits without losing the last typed character', () => {
    const draft = newCatalogProductDraft();
    TestBed.configureTestingModule({ imports: [UserCatalogViewComponent] });
    const fixture = TestBed.createComponent(UserCatalogViewComponent);
    fixture.componentRef.setInput('state', { loading: false, errorMessage: '', list: null, products: [], brands: [], categories: [], draft, brandDraft: { id: '', name: '' }, categoryDraft: { id: '', name: '' }, query: emptyCatalogQuery, queryDirty: false });
    const emitted: typeof draft[] = [];
    fixture.componentInstance.draftChange.subscribe(value => emitted.push(value));

    for (const value of ['1', '12', '120', '1200', '12000', '120000', '120000.', '120000.2', '120000.25']) {
      fixture.componentInstance.setProductBasePriceInput(value);
    }

    expect(emitted.at(-1)).toEqual(expect.objectContaining({ productBasePriceRaw: '120000.25', productBasePrice: 120000.25 }));
  });

  it('blocks persistence when a variant arrives with an unknown closed status', () => {
    const product = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Producto', status: 'ACTIVE', productBasePrice: 10, price: { base: 10, original: 10, effective: 10 },
      variants: [{ id: 'variant-id', sku: 'VAR-1', name: 'Original', status: 'FUTURE', availability: 'AVAILABLE', attributes: {}, inventory: { sku: 'VAR-1', state: 'KNOWN', available: 2, reserved: 0, safety: 0, onHand: 2, saleable: 2 } }] }], total: 1, page: 0, size: 50, truncated: false })[0];
    const save = vi.fn(() => of(product));
    const store = new AdminCatalogStore({ save } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor({ id: 'actor', roles: [UserRole.Admin] });
    store.beginEdit(product);
    store.persist();
    expect(save).not.toHaveBeenCalled();
    expect(store.snapshot.errorMessage).toContain('estado conocido');
    store.ngOnDestroy();
  });

  it('creates a product draft with one primary variant and non-negative initial stock', () => {
    const result = mapProductDetails({ items: [{ id: 'p', sku: 'NEW-1', name: 'Nuevo', status: 'DRAFT', price: { base: 0, original: 0, effective: 0 }, variants: [{ id: 'v', sku: 'NEW-1', name: 'Principal', status: 'ACTIVE', availability: 'AVAILABLE', attributes: {}, inventory: { sku: 'NEW-1', state: 'KNOWN', available: 4, reserved: 0, safety: 0, onHand: 4, saleable: 4 } }] }], total: 1, page: 0, size: 50, truncated: false });
    const save = vi.fn(() => of(result[0]));
    const store = new AdminCatalogStore({ save, list: () => of(result) } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor({ id: 'actor', roles: [UserRole.Admin] });
    const draft = newCatalogProductDraft();
    store.setDraft({ ...draft, sku: 'NEW-1', name: 'Nuevo', variants: [{ ...draft.variants[0], sku: 'NEW-1', name: 'Principal', initialAvailableQuantity: 4 }] });
    store.persist();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ sku: 'NEW-1', variants: [expect.objectContaining({ initialAvailableQuantity: 4 })] }));
    store.ngOnDestroy();
  });

  it('locks the submitted draft until its write resolves', () => {
    const result = mapProductDetails({ items: [{ id: 'p', sku: 'A', name: 'Producto A', status: 'DRAFT', price: { base: 1, original: 1, effective: 1 }, variants: [{ id: 'v', sku: 'A', name: 'Principal', status: 'ACTIVE', availability: 'AVAILABLE', attributes: {}, inventory: { sku: 'A', state: 'KNOWN', available: 1, reserved: 0, safety: 0, onHand: 1, saleable: 1 } }] }], total: 1, page: 0, size: 50, truncated: false });
    const pending = new Subject<(typeof result)[number]>(); const save = vi.fn(() => pending);
    const store = new AdminCatalogStore({ save, list: () => of(result) } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor({ id: 'actor', roles: [UserRole.Admin] });
    const draft = newCatalogProductDraft(); const submitted = { ...draft, sku: 'A', name: 'Producto A', variants: [{ ...draft.variants[0], sku: 'A', name: 'Principal', initialAvailableQuantity: 1 }] };
    store.setDraft(submitted); store.persist();
    expect(store.snapshot.loading).toBe(true); expect(save).toHaveBeenCalledTimes(1);
    store.beginCreate(); store.setDraft({ ...submitted, sku: 'B', name: 'Producto B' }); store.persist();
    expect(store.snapshot.draft).toBe(submitted); expect(save).toHaveBeenCalledTimes(1);
    pending.next(result[0]); pending.complete();
    expect(store.snapshot.draft.sku).toBe('');
    store.ngOnDestroy();
  });
});
