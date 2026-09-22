import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CART_REPOSITORY } from '../../../core/tokens/cart.tokens';
import { CheckoutCommand, CheckoutReceipt } from '../cart.entity';
import { ICartRepository } from '../cart.repository';

@Injectable()
export class CheckoutCartUseCase {
  constructor(@Inject(CART_REPOSITORY) private readonly repo: ICartRepository) {}

  execute(command: CheckoutCommand): Observable<CheckoutReceipt> {
    return this.repo.checkout(command);
  }
}
