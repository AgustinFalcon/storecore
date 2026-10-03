import { Observable } from 'rxjs';
import { Cart } from '../cart.entity';
import { ICartRepository } from '../cart.repository';

export class AddCartLineUseCase {
  constructor(private readonly repo: ICartRepository) {}

  execute(sku: string, quantity: number): Observable<Cart> {
    return this.repo.addLine(sku, quantity);
  }
}
