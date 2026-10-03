import { Observable } from 'rxjs';
import { AdminOrder, RmaTransition, ShipmentTransition } from '../order.entity';
import { IOrderRepository } from '../order.repository';

export class AdvanceFulfillmentUseCase {
  constructor(private readonly repo: IOrderRepository) {}

  ship(orderId: string, status: ShipmentTransition, tracking: string | null = null): Observable<AdminOrder> {
    return this.repo.advanceShipment(orderId, status, tracking);
  }

  rma(orderId: string, status: RmaTransition): Observable<AdminOrder> {
    return this.repo.advanceRma(orderId, status);
  }
}
