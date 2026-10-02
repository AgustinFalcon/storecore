import { Observable } from 'rxjs';
import { ICatalogRepository } from '../catalog.repository';
import { ProductDetail } from '../product-detail.entity';

export class GetProductUseCase {
  constructor(private readonly repo: ICatalogRepository) {}

  execute(sku: string): Observable<ProductDetail> {
    return this.repo.readProduct(sku);
  }
}
