import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CART_REPOSITORY } from '../../../core/tokens/cart.tokens';
import { Cart } from '../cart.entity';
import { ICartRepository } from '../cart.repository';

@Injectable()
export class GetCartUseCase {
  constructor(@Inject(CART_REPOSITORY) private readonly repo: ICartRepository) {}

  execute(): Observable<Cart> {
    return this.repo.read();
  }
}
