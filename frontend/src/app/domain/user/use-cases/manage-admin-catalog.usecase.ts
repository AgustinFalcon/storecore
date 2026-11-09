import { BoundedPageRequest } from '../../catalog/bounded-page';
import { BoundedRows } from '../../catalog/bounded-rows';
import { Observable } from 'rxjs';
import { CatalogFacet } from '../../catalog/catalog-facet.entity';
import { ProductDetail } from '../../catalog/product-detail.entity';
import { IUserRepository } from '../user.repository';

export class ManageAdminCatalogUseCase {
  constructor(private readonly repo: IUserRepository) {}

  list(page = BoundedPageRequest.first()): Observable<BoundedRows<ProductDetail>> {
    return this.repo.listCatalog(page);
  }

  save(product: ProductDetail): Observable<ProductDetail> {
    return this.repo.saveProduct(product);
  }

  saveBrand(facet: CatalogFacet): Observable<CatalogFacet> {
    return this.repo.saveBrand(facet);
  }

  saveCategory(facet: CatalogFacet): Observable<CatalogFacet> {
    return this.repo.saveCategory(facet);
  }
}
