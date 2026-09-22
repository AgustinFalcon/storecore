import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ORDER_REPOSITORY } from '../../../core/tokens/order.tokens';
import { CustomerOrder } from '../order.entity';
import { IOrderRepository } from '../order.repository';

@Injectable()
export class GetMyOrderUseCase {
  constructor(@Inject(ORDER_REPOSITORY) private readonly repo: IOrderRepository) {}

  execute(orderId: string): Observable<CustomerOrder> {
    return this.repo.readMine(orderId);
  }
}
