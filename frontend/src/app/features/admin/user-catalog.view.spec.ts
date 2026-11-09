import { UserRole } from '../../domain/user/user-role';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { mapProductDetails } from '../../data/mappers/http-mappers';
import { ManageAdminCatalogUseCase } from '../../domain/user/use-cases/manage-admin-catalog.usecase';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { AdminCatalogStore } from './admin-catalog.store';
import { UserCatalogViewComponent } from './user-catalog.view';

describe('bounded administrative catalog', () => {
  it('keeps one product with multiple variants, closed statuses and exact partial totals', () => {
    const products = mapProductDetails({ items: [{ id: 'p', sku: 'SKU', name: 'Producto', status: 'ARCHIVED', price: { base: 10, original: 10, effective: 10 },
      variants: ['A', 'B'].map(id => ({ id, sku: id, name: id, status: 'INACTIVE', availability: 'UNAVAILABLE', attributes: { Material: 'Acero', Color: 'Negro' }, inventory: { sku: id, state: 'MISSING', available: null, reserved: null, safety: null, onHand: null, saleable: null } })) }], total: 120, page: 0, size: 50, truncated: true });
    const store = new AdminCatalogStore({ list: () => of(products) } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor({ id: 'actor', roles: [UserRole.Admin] });
    store.load(); store.setDraft(products[0]);
    expect(store.snapshot.products).toHaveLength(1);
    expect(store.snapshot.list?.total).toBe(120);
    TestBed.configureTestingModule({ imports: [UserCatalogViewComponent] });
    const fixture = TestBed.createComponent(UserCatalogViewComponent);
    fixture.componentRef.setInput('state', store.snapshot); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Archivado');
    expect(fixture.nativeElement.textContent).toContain('Lectura parcial');
    expect(Array.from(fixture.nativeElement.querySelectorAll('dt') as NodeListOf<HTMLElement>).map(node => node.textContent)).toEqual(['Material', 'Color', 'Material', 'Color']);
    store.ngOnDestroy();
  });
});
