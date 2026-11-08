import { Observable } from 'rxjs';
import { AdminOrder } from '../order.entity';
import { IOrderRepository } from '../order.repository';
import { firstOrderPage, OrderPage, OrderQuery } from '../order-projection';

export class ListAdminOrdersUseCase {
  constructor(private readonly repo: IOrderRepository) {}

  execute(query: OrderQuery = firstOrderPage): Observable<OrderPage<AdminOrder>> {
    return this.repo.listAdmin(query);
  }
}
