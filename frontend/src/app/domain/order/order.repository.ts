import { Observable } from 'rxjs';
import { AdminOrder, CustomerOrder, RmaTransition, ShipmentTransition } from './order.entity';
import { OrderPage, OrderQuery } from './order-projection';

export interface IOrderRepository {
  listMine(query?: OrderQuery): Observable<OrderPage<CustomerOrder>>;
  readMine(orderId: string): Observable<CustomerOrder>;
  listAdmin(query?: OrderQuery): Observable<OrderPage<AdminOrder>>;
  readAdmin(orderId: string): Observable<AdminOrder>;
  advanceShipment(orderId: string, status: ShipmentTransition, tracking: string | null): Observable<AdminOrder>;
  advanceRma(orderId: string, status: RmaTransition): Observable<AdminOrder>;
}
