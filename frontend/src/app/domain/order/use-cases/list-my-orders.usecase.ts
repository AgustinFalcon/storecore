import { Observable } from 'rxjs';
import { CustomerOrder } from '../order.entity';
import { IOrderRepository } from '../order.repository';
import { firstOrderPage, OrderPage, OrderQuery } from '../order-projection';

export class ListMyOrdersUseCase {
  constructor(private readonly repo: IOrderRepository) {}

  execute(query: OrderQuery = firstOrderPage): Observable<OrderPage<CustomerOrder>> {
    return this.repo.listMine(query);
  }
}
