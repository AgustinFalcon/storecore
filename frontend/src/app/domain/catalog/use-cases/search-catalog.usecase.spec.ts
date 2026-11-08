import { firstValueFrom, of } from 'rxjs';
import { emptyCatalogQuery } from '../catalog-query.entity';
import { ICatalogRepository } from '../catalog.repository';
import { SearchCatalogUseCase } from './search-catalog.usecase';

describe('SearchCatalogUseCase', () => {
  it('delegates search to the HTTP catalog port', async () => {
    const repo: ICatalogRepository = {
      search: (query) => of(Object.assign([{ sku: query.query || 'x', name: query.query, price: 0, originalPrice: null, imageUrl: null, offerRef: null }], { metadata: { total: 1, page: 0, size: 50, truncated: false } })),
      readProduct: () => of() as never,
      listBrands: () => of([]),
      listCategories: () => of([]),
    };
    const useCase = new SearchCatalogUseCase(repo);
    const items = await firstValueFrom(useCase.execute({ ...emptyCatalogQuery, query: 'sku-1' }));
    expect(items.length).toBe(1);
    expect(items[0]?.sku).toBe('sku-1');
  });
});
