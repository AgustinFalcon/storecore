import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ORDER_REPOSITORY } from '../../../core/tokens/order.tokens';
import { AdminOrder, RmaTransition, ShipmentTransition } from '../order.entity';
import { IOrderRepository } from '../order.repository';

@Injectable()
export class AdvanceFulfillmentUseCase {
  constructor(@Inject(ORDER_REPOSITORY) private readonly repo: IOrderRepository) {}

  ship(orderId: string, status: ShipmentTransition, tracking: string | null = null): Observable<AdminOrder> {
    return this.repo.advanceShipment(orderId, status, tracking);
  }

  rma(orderId: string, status: RmaTransition): Observable<AdminOrder> {
    return this.repo.advanceRma(orderId, status);
  }
}
