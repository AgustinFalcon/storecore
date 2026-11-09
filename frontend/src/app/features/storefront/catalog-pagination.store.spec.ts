import { of, Subject } from 'rxjs';
import { BoundedPageRequest } from '../../domain/catalog/bounded-page';
import { BoundedRows } from '../../domain/catalog/bounded-rows';
import { emptyCatalogQuery, CatalogQuery } from '../../domain/catalog/catalog-query.entity';
import { ProductSummary } from '../../domain/catalog/product-summary.entity';
import { SearchCatalogUseCase } from '../../domain/catalog/use-cases/search-catalog.usecase';
import { GetHomeUseCase } from '../../domain/catalog/use-cases/get-home.usecase';
import { GetProductUseCase } from '../../domain/catalog/use-cases/get-product.usecase';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { CatalogStore } from './catalog.store';

function rows(page: number, total: number, sku?: string): BoundedRows<ProductSummary> {
  const items: ProductSummary[] = sku ? [{ sku, name: sku, price: 1, originalPrice: null, imageUrl: null, offerRef: null }] : [];
  return Object.assign(items, { metadata: { page, size: 50, total, truncated: page * 50 + items.length < total } });
}
function create(execute: (query: CatalogQuery) => ReturnType<SearchCatalogUseCase['execute']>): CatalogStore {
  return new CatalogStore({ execute } as SearchCatalogUseCase, {} as GetHomeUseCase, {} as GetProductUseCase, {} as ListCatalogFacetsUseCase);
}

describe('public catalog bounded navigation', () => {
  it('navigates valid pages and preserves page and filters on refresh', () => {
    const execute = vi.fn((query: CatalogQuery) => of(rows(query.pagination.page, 51, `SKU-${query.pagination.page}`)));
    const store = create(execute);
    store.setQuery({ ...emptyCatalogQuery, query: 'lamp', brand: '1', category: '2', offersOnly: true });
    store.search(); store.goToPage(1); store.search();
    expect(execute.mock.calls.map(([query]) => query.pagination.page)).toEqual([0, 1, 1]);
    expect(store.snapshot.query).toMatchObject({ query: 'lamp', brand: '1', category: '2', offersOnly: true });
    for (const invalid of [-1, 2, 0.5, NaN, 10001]) store.goToPage(invalid);
    expect(execute).toHaveBeenCalledTimes(3);
    store.goToPage(0); expect(store.snapshot.query.pagination.page).toBe(0);
    store.ngOnDestroy();
  });

  it.each(['query', 'brand', 'category', 'offersOnly'] as const)('resets page for %s changes', field => {
    const store = create(query => of(rows(query.pagination.page, 51, 'SKU')));
    store.search(); store.goToPage(1);
    store.setQuery({ ...store.snapshot.query, [field]: field === 'offersOnly' ? true : 'changed' });
    expect(store.snapshot.query.pagination.page).toBe(0);
    expect(store.snapshot.products).toEqual([]);
    store.ngOnDestroy();
  });

  it.each([50, 0])('recovers page one exactly once when total shrinks to %i', total => {
    const execute = vi.fn((query: CatalogQuery) => of(rows(query.pagination.page, total)));
    const store = create(execute);
    store.setQuery({ ...emptyCatalogQuery, pagination: BoundedPageRequest.at(1) }); store.search();
    expect(execute.mock.calls.map(([query]) => query.pagination.page)).toEqual([1, 0]);
    expect(store.snapshot.query.pagination.page).toBe(0);
    expect(store.snapshot.loading).toBe(false);
    store.ngOnDestroy();
  });

  it('stops after a second shrink, without presenting old rows', () => {
    const execute = vi.fn().mockReturnValueOnce(of(rows(2, 51))).mockReturnValueOnce(of(rows(1, 0)));
    const store = create(execute);
    store.setQuery({ ...emptyCatalogQuery, pagination: BoundedPageRequest.at(2) }); store.search();
    expect(execute).toHaveBeenCalledTimes(2); expect(store.snapshot.products).toHaveLength(0);
    expect(store.snapshot.loading).toBe(false); store.ngOnDestroy();
  });

  it('ignores old page responses and invalidates a pending response immediately on filter edits', () => {
    const old = new Subject<BoundedRows<ProductSummary>>();
    const current = new Subject<BoundedRows<ProductSummary>>();
    const execute = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(current);
    const store = create(execute); store.search(); store.search();
    current.next(rows(0, 1, 'CURRENT')); old.next(rows(0, 1, 'OLD'));
    expect(store.snapshot.products[0]?.sku).toBe('CURRENT');
    store.setQuery({ ...store.snapshot.query, query: 'new' });
    current.next(rows(0, 1, 'STALE-FILTER'));
    expect(store.snapshot.products).toEqual([]); expect(store.snapshot.list).toBeNull();
    store.ngOnDestroy();
  });
});
