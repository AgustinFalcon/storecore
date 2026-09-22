import { Observable } from 'rxjs';
import { CatalogFacet } from './catalog-facet.entity';
import { CatalogQuery } from './catalog-query.entity';
import { HomeContent } from './home-content.entity';
import { ProductDetail } from './product-detail.entity';
import { ProductSummary } from './product-summary.entity';

export interface ICatalogRepository {
  search(query: CatalogQuery): Observable<readonly ProductSummary[]>;
  readProduct(sku: string): Observable<ProductDetail>;
  listBrands(): Observable<readonly CatalogFacet[]>;
  listCategories(): Observable<readonly CatalogFacet[]>;
  readHome(): Observable<HomeContent>;
}
