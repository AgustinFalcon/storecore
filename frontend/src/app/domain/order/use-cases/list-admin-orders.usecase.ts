import { Observable } from 'rxjs';
import { AdminOrder } from '../order.entity';
import { IOrderRepository } from '../order.repository';

export class ListAdminOrdersUseCase {
  constructor(private readonly repo: IOrderRepository) {}

  execute(): Observable<readonly AdminOrder[]> {
    return this.repo.listAdmin();
  }
}
