import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CATALOG_REPOSITORY } from '../../../core/tokens/catalog.tokens';
import { ICatalogRepository } from '../catalog.repository';
import { ProductDetail } from '../product-detail.entity';

@Injectable()
export class GetProductUseCase {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: ICatalogRepository) {}

  execute(sku: string): Observable<ProductDetail> {
    return this.repo.readProduct(sku);
  }
}
