import { Observable } from 'rxjs';
import { CheckoutCommand, CheckoutReceipt } from '../cart.entity';
import { ICartRepository } from '../cart.repository';

export class CheckoutCartUseCase {
  constructor(private readonly repo: ICartRepository) {}

  execute(command: CheckoutCommand): Observable<CheckoutReceipt> {
    return this.repo.checkout(command);
  }
}
