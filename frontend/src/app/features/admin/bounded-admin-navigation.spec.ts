import { Subject, of } from 'rxjs';
import { BoundedRows } from '../../domain/catalog/bounded-rows';
import { BoundedPageRequest } from '../../domain/catalog/bounded-page';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { InventoryRow } from '../../domain/user/user.entity';
import { UserRole } from '../../domain/user/user-role';
import { InventoryFilter } from '../../domain/user/inventory-filter';
import { ManageAdminCatalogUseCase } from '../../domain/user/use-cases/manage-admin-catalog.usecase';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { AdminCatalogStore } from './admin-catalog.store';
import { UserInventoryStore } from './user-inventory.store';

function page<T>(index: number, total: number): BoundedRows<T> {
  return Object.assign([] as T[], { metadata: { page: index, size: 50, total, truncated: total > (index + 1) * 50 } });
}
const actor = { id: 'actor', roles: [UserRole.Admin] };

describe('bounded protected navigation', () => {
  it('admin preserves the selected page on refresh and recovers exactly once after shrink', () => {
    const list = vi.fn((request: BoundedPageRequest) => of(page<ProductDetail>(request.page, 51)));
    const store = new AdminCatalogStore({ list } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor(actor); store.load(); store.goToPage(1); store.load();
    expect(list.mock.calls.map(([request]) => request.page)).toEqual([0, 1, 1]);
    list.mockImplementation(request => of(page<ProductDetail>(request.page, 50)));
    store.load();
    expect(list.mock.calls.slice(-2).map(([request]) => request.page)).toEqual([1, 0]);
    expect(store.snapshot.list?.page).toBe(0);
    store.ngOnDestroy();
  });

  it('does not loop when the recovery response shrinks again', () => {
    const list = vi.fn((request: BoundedPageRequest) => of(page<ProductDetail>(request.page, 151)));
    const store = new AdminCatalogStore({ list } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor(actor); store.load(); store.goToPage(1); store.goToPage(2);
    list.mockImplementation(request => of(page<ProductDetail>(request.page, request.page === 2 ? 51 : 0)));
    const before = list.mock.calls.length; store.load();
    expect(list.mock.calls.length - before).toBe(2);
    expect(store.snapshot.loading).toBe(false); expect(store.snapshot.products).toHaveLength(0);
    store.ngOnDestroy();
  });

  it('clears protected catalog and draft immediately and ignores delayed responses across actor changes', () => {
    const response = new Subject<BoundedRows<ProductDetail>>();
    const list = vi.fn(() => response.asObservable());
    const store = new AdminCatalogStore({ list } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor(actor); store.load();
    store.setBrandDraft({ id: 'private', name: 'Private' });
    store.setActor(null); response.next(page(0, 51)); response.error(new Error('late'));
    expect(store.snapshot.products).toEqual([]); expect(store.snapshot.list).toBeNull();
    expect(store.snapshot.brandDraft.id).toBe(''); expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.errorMessage).toBe(''); store.load(); expect(list).toHaveBeenCalledTimes(1);
    store.ngOnDestroy();
  });

  it('ignores an older catalog refresh once a newer response succeeds', () => {
    const older = new Subject<BoundedRows<ProductDetail>>();
    const newer = new Subject<BoundedRows<ProductDetail>>();
    const list = vi.fn().mockReturnValueOnce(older).mockReturnValueOnce(newer);
    const store = new AdminCatalogStore({ list } as unknown as ManageAdminCatalogUseCase, {} as ListCatalogFacetsUseCase);
    store.setActor(actor); store.load(); store.load(); newer.next(page(0, 100)); older.next(page(0, 200));
    expect(store.snapshot.list?.total).toBe(100); store.ngOnDestroy();
  });

  it('inventory preserves local filters and refresh page, and resets page for a new actor', () => {
    const listInventory = vi.fn((request: BoundedPageRequest) => of(page<InventoryRow>(request.page, 51)));
    const store = new UserInventoryStore({ listInventory } as unknown as ManageInstallationUseCase);
    store.setActor(actor); store.loadInventory(); store.setQuery('sku'); store.setFilter(InventoryFilter.Out);
    store.goToPage(1); store.loadInventory();
    expect(listInventory.mock.calls.map(([request]) => request.page)).toEqual([0, 1, 1]);
    listInventory.mockImplementation(request => of(page<InventoryRow>(request.page, 50)));
    store.loadInventory();
    expect(listInventory.mock.calls.slice(-2).map(([request]) => request.page)).toEqual([1, 0]);
    expect(store.snapshot.query).toBe('sku'); expect(store.snapshot.filter).toBe(InventoryFilter.Out);
    store.setActor({ ...actor, id: 'replacement' }); store.loadInventory();
    expect(listInventory.mock.lastCall?.[0].page).toBe(0); expect(store.snapshot.query).toBe('');
    store.ngOnDestroy();
  });
});
