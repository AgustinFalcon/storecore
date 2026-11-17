import { Observable } from 'rxjs';
import { AdminProductOptionsSnapshot, ProductOptionsCommand, ProductOptionsWriteResult } from './admin-product-options';

export interface IProductOptionsRepository {
  read(sku: string): Observable<AdminProductOptionsSnapshot>;
  write(sku: string, command: ProductOptionsCommand): Observable<ProductOptionsWriteResult>;
}

export class ManageProductOptionsUseCase {
  constructor(private readonly repository: IProductOptionsRepository) {}
  read(sku: string): Observable<AdminProductOptionsSnapshot> { return this.repository.read(sku); }
  write(sku: string, command: ProductOptionsCommand): Observable<ProductOptionsWriteResult> { return this.repository.write(sku, command); }
}
