import { Observable } from 'rxjs';
import { Cart } from '../cart.entity';
import { ICartRepository } from '../cart.repository';

export class GetCartUseCase {
  constructor(private readonly repo: ICartRepository) {}

  execute(): Observable<Cart> {
    return this.repo.read();
  }
}
