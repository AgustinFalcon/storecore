import { of, throwError } from 'rxjs';
import { HomeBlockKind as Kind } from '../../domain/content/home-composition';
import { GetHomeUseCase } from '../../domain/catalog/use-cases/get-home.usecase';
import { GetProductUseCase } from '../../domain/catalog/use-cases/get-product.usecase';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { SearchCatalogUseCase } from '../../domain/catalog/use-cases/search-catalog.usecase';
import { CatalogStore } from './catalog.store';
describe('storefront composition references', () => {
  it('fetches exactly configured SKU references independently of catalog search and fails closed when absent', () => {
    const home = {revision: 2, sections: [{key: 'products', kind: Kind.ProductRail, active: true, sortOrder: 0, content: {title: 'Selección', skus: ['A', 'MISSING', 'INACTIVE']}, updatedAt: null}]};
    const product = {sku: 'A', name: 'Producto real', active: true, variants: [], price: {effective: 42}, images: [], offerRef: null};
    const read = vi.fn((sku: string) => sku === 'MISSING' ? throwError(() => new Error('404')) : of({...product, sku, active: sku !== 'INACTIVE'}));
    const search = vi.fn();
    const store = new CatalogStore({execute: search} as unknown as SearchCatalogUseCase, {execute: () => of(home)} as unknown as GetHomeUseCase, {execute: read} as unknown as GetProductUseCase, {execute: () => of({brands: [], categories: []})} as unknown as ListCatalogFacetsUseCase);
    store.loadStorefront();
    expect(read.mock.calls.map(args => args[0])).toEqual(['A', 'MISSING', 'INACTIVE']); expect(search).not.toHaveBeenCalled();
    expect(store.snapshot.offers).toEqual([{sku: 'A', name: 'Producto real', price: 42, originalPrice: null, imageUrl: null, offerRef: null}]);
    expect(store.snapshot.home).toEqual(home); expect(store.snapshot.loading).toBe(false); store.ngOnDestroy();
  });
});
