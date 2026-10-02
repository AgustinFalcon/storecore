import { Observable } from 'rxjs';
import { CustomerOrder } from '../order.entity';
import { IOrderRepository } from '../order.repository';

export class ListMyOrdersUseCase {
  constructor(private readonly repo: IOrderRepository) {}

  execute(): Observable<readonly CustomerOrder[]> {
    return this.repo.listMine();
  }
}
