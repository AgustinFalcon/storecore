import { BoundedRows } from '../bounded-rows';
import { map, Observable } from 'rxjs';
import { CatalogQuery } from '../catalog-query.entity';
import { ICatalogRepository } from '../catalog.repository';
import { ProductSummary } from '../product-summary.entity';

export class SearchCatalogUseCase {
  constructor(private readonly repo: ICatalogRepository) {}

  execute(query: CatalogQuery): Observable<BoundedRows<ProductSummary>> {
    return this.repo.search(query).pipe(map(rows => {
      if (rows.metadata.page !== query.pagination.page || rows.metadata.size !== query.pagination.size) {
        throw new Error('La página recibida no coincide con la solicitada.');
      }
      return rows;
    }));
  }
}
