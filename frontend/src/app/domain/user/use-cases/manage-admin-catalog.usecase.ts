import { BoundedRows } from '../../catalog/bounded-rows';
import { Observable } from 'rxjs';
import { CatalogFacet } from '../../catalog/catalog-facet.entity';
import { ProductDetail } from '../../catalog/product-detail.entity';
import { CatalogProductDraft } from '../../catalog/catalog-product-draft';
import { CatalogQuery, emptyCatalogQuery } from '../../catalog/catalog-query.entity';
import { IUserRepository } from '../user.repository';

export class ManageAdminCatalogUseCase {
  constructor(private readonly repo: IUserRepository) {}

  list(query: CatalogQuery = emptyCatalogQuery): Observable<BoundedRows<ProductDetail>> {
    return this.repo.listCatalog(query);
  }

  save(product: CatalogProductDraft): Observable<ProductDetail> {
    return this.repo.saveProduct(product);
  }

  saveBrand(facet: CatalogFacet): Observable<CatalogFacet> {
    return this.repo.saveBrand(facet);
  }

  saveCategory(facet: CatalogFacet): Observable<CatalogFacet> {
    return this.repo.saveCategory(facet);
  }
}
