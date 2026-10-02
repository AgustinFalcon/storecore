import { forkJoin, Observable } from 'rxjs';
import { CatalogFacet } from '../catalog-facet.entity';
import { ICatalogRepository } from '../catalog.repository';

export class ListCatalogFacetsUseCase {
  constructor(private readonly repo: ICatalogRepository) {}

  execute(): Observable<{ brands: readonly CatalogFacet[]; categories: readonly CatalogFacet[] }> {
    return forkJoin({
      brands: this.repo.listBrands(),
      categories: this.repo.listCategories(),
    });
  }
}
