import { Observable } from 'rxjs';
import { AdminOrder, CustomerOrder, RmaTransition, ShipmentTransition } from './order.entity';

export interface IOrderRepository {
  listMine(): Observable<readonly CustomerOrder[]>;
  readMine(orderId: string): Observable<CustomerOrder>;
  listAdmin(): Observable<readonly AdminOrder[]>;
  readAdmin(orderId: string): Observable<AdminOrder>;
  advanceShipment(orderId: string, status: ShipmentTransition, tracking: string | null): Observable<AdminOrder>;
  advanceRma(orderId: string, status: RmaTransition): Observable<AdminOrder>;
}
