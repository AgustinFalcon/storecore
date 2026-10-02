import { Observable } from 'rxjs';
import { CustomerOrder } from '../order.entity';
import { IOrderRepository } from '../order.repository';

export class GetMyOrderUseCase {
  constructor(private readonly repo: IOrderRepository) {}

  execute(orderId: string): Observable<CustomerOrder> {
    return this.repo.readMine(orderId);
  }
}
