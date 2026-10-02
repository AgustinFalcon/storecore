import { Observable } from 'rxjs';
import { AdminOrder } from '../order.entity';
import { IOrderRepository } from '../order.repository';

export class GetAdminOrderUseCase {
  constructor(private readonly repo: IOrderRepository) {}

  execute(orderId: string): Observable<AdminOrder> {
    return this.repo.readAdmin(orderId);
  }
}
