import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { USER_REPOSITORY } from '../../../core/tokens/user.tokens';
import { CatalogFacet } from '../../catalog/catalog-facet.entity';
import { ProductDetail } from '../../catalog/product-detail.entity';
import { IUserRepository } from '../user.repository';

@Injectable()
export class ManageAdminCatalogUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  list(): Observable<readonly ProductDetail[]> {
    return this.repo.listCatalog();
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
