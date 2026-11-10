import { UserRole } from '../../domain/user/user-role';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { mapProductDetails } from '../../data/mappers/http-mappers';
import { ManageAdminCatalogUseCase } from '../../domain/user/use-cases/manage-admin-catalog.usecase';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { AdminCatalogStore } from './admin-catalog.store';
import { UserCatalogViewComponent } from './user-catalog.view';

describe('bounded administrative catalog', () => {
  it('keeps one product with multiple variants, closed statuses and exact partial totals', async () => {
    const products = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Producto', status: 'ARCHIVED', price: { base: 10, original: 10, effective: 10 },
      variants: ['A', 'B'].map(id => ({ id, sku: id, name: id, status: 'INACTIVE', availability: 'UNAVAILABLE', attributes: { Material: 'Acero', Color: 'Negro' }, inventory: { sku: id, state: 'MISSING', available: null, reserved: null, safety: null, onHand: null, saleable: null } })) }], total: 120, page: 0, size: 50, truncated: true });
    const store = new AdminCatalogStore({ list: () => of(products) } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor({ id: 'actor', roles: [UserRole.Admin] });
    store.load(); store.setDraft(products[0]);
    expect(store.snapshot.products).toHaveLength(1);
    expect(store.snapshot.list?.total).toBe(120);
    TestBed.configureTestingModule({ imports: [UserCatalogViewComponent] });
    const fixture = TestBed.createComponent(UserCatalogViewComponent);
    fixture.componentRef.setInput('state', { ...store.snapshot, draft: products[0] }); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Archivado');
    expect(fixture.nativeElement.textContent).toContain('Lectura parcial');
    expect(Array.from(fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>)
      .map(input => input.value).filter(value => value === 'Material' || value === 'Color')).toEqual(['Material', 'Color', 'Material', 'Color']);
    store.ngOnDestroy();
  });

  it('edits existing variant presentation and attributes without changing identity or SKU', async () => {
    const product = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Producto', status: 'ACTIVE', price: { base: 10, original: 10, effective: 10 },
      variants: [{ id: 'variant-id', sku: 'VAR-1', name: 'Original', status: 'ACTIVE', availability: 'AVAILABLE', attributes: { Color: 'Negro' }, inventory: { sku: 'VAR-1', state: 'KNOWN', available: 2, reserved: 0, safety: 0, onHand: 2, saleable: 2 } }] }], total: 1, page: 0, size: 50, truncated: false })[0];
    TestBed.configureTestingModule({ imports: [UserCatalogViewComponent] });
    const fixture = TestBed.createComponent(UserCatalogViewComponent);
    fixture.componentRef.setInput('state', { loading: false, errorMessage: '', list: null, products: [product], brands: [], categories: [], draft: product, brandDraft: { id: '', name: '' }, categoryDraft: { id: '', name: '' } });

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

  it('preserves untouched JSON attribute types and rejects duplicate key collisions', async () => {
    const product = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Producto', status: 'ACTIVE', price: { base: 10, original: 10, effective: 10 },
      variants: [{ id: 'variant-id', sku: 'VAR-1', name: 'Original', status: 'ACTIVE', availability: 'AVAILABLE', attributes: { Weight: 2, Enabled: true, Nested: { a: 1 }, Color: 'Negro' }, inventory: { sku: 'VAR-1', state: 'KNOWN', available: 2, reserved: 0, safety: 0, onHand: 2, saleable: 2 } }] }], total: 1, page: 0, size: 50, truncated: false })[0];
    TestBed.configureTestingModule({ imports: [UserCatalogViewComponent] });
    const fixture = TestBed.createComponent(UserCatalogViewComponent);
    fixture.componentRef.setInput('state', { loading: false, errorMessage: '', list: null, products: [product], brands: [], categories: [], draft: product, brandDraft: { id: '', name: '' }, categoryDraft: { id: '', name: '' } });

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

  it('blocks persistence when a variant arrives with an unknown closed status', () => {
    const product = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Producto', status: 'ACTIVE', price: { base: 10, original: 10, effective: 10 },
      variants: [{ id: 'variant-id', sku: 'VAR-1', name: 'Original', status: 'FUTURE', availability: 'AVAILABLE', attributes: {}, inventory: { sku: 'VAR-1', state: 'KNOWN', available: 2, reserved: 0, safety: 0, onHand: 2, saleable: 2 } }] }], total: 1, page: 0, size: 50, truncated: false })[0];
    const save = vi.fn(() => of(product));
    const store = new AdminCatalogStore({ save } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor({ id: 'actor', roles: [UserRole.Admin] });
    store.setDraft(product);
    store.persist();
    expect(save).not.toHaveBeenCalled();
    expect(store.snapshot.errorMessage).toContain('estado conocido');
    store.ngOnDestroy();
  });
});
