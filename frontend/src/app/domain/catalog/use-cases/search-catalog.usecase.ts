import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CATALOG_REPOSITORY } from '../../../core/tokens/catalog.tokens';
import { CatalogQuery } from '../catalog-query.entity';
import { ICatalogRepository } from '../catalog.repository';
import { ProductSummary } from '../product-summary.entity';

@Injectable()
export class SearchCatalogUseCase {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: ICatalogRepository) {}

  execute(query: CatalogQuery): Observable<readonly ProductSummary[]> {
    return this.repo.search(query);
  }
}
