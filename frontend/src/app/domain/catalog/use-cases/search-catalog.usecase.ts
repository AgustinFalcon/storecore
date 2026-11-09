import { BoundedRows } from '../bounded-rows';
import { Observable } from 'rxjs';
import { CatalogQuery } from '../catalog-query.entity';
import { ICatalogRepository } from '../catalog.repository';
import { ProductSummary } from '../product-summary.entity';

export class SearchCatalogUseCase {
  constructor(private readonly repo: ICatalogRepository) {}

  execute(query: CatalogQuery): Observable<BoundedRows<ProductSummary>> {
    return this.repo.search(query);
  }
}
