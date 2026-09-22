import { Inject, Injectable } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { CATALOG_REPOSITORY } from '../../../core/tokens/catalog.tokens';
import { CatalogFacet } from '../catalog-facet.entity';
import { ICatalogRepository } from '../catalog.repository';

@Injectable()
export class ListCatalogFacetsUseCase {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: ICatalogRepository) {}

  execute(): Observable<{ brands: readonly CatalogFacet[]; categories: readonly CatalogFacet[] }> {
    return forkJoin({
      brands: this.repo.listBrands(),
      categories: this.repo.listCategories(),
    });
  }
}
