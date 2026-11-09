import { firstValueFrom, of } from 'rxjs';
import { emptyCatalogQuery } from '../catalog-query.entity';
import { BoundedPageRequest } from '../bounded-page';
import { ICatalogRepository } from '../catalog.repository';
import { SearchCatalogUseCase } from './search-catalog.usecase';

describe('SearchCatalogUseCase', () => {
  it('rejects a response belonging to another requested page', async () => {
    const repo = { search: () => of(Object.assign([], { metadata: { total: 0, page: 0, size: 50, truncated: false } })) } as unknown as ICatalogRepository;
    await expect(firstValueFrom(new SearchCatalogUseCase(repo).execute({ ...emptyCatalogQuery, pagination: BoundedPageRequest.at(1) }))).rejects.toThrow();
  });
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
