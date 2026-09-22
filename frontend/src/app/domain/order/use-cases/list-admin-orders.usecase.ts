import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ORDER_REPOSITORY } from '../../../core/tokens/order.tokens';
import { AdminOrder } from '../order.entity';
import { IOrderRepository } from '../order.repository';

@Injectable()
export class ListAdminOrdersUseCase {
  constructor(@Inject(ORDER_REPOSITORY) private readonly repo: IOrderRepository) {}

  execute(): Observable<readonly AdminOrder[]> {
    return this.repo.listAdmin();
  }
}
