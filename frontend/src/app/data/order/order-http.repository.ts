import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { AdminOrder, CustomerOrder, RmaTransition, ShipmentTransition } from '../../domain/order/order.entity';
import { IOrderRepository } from '../../domain/order/order.repository';
import { mapAdminOrder, mapAdminOrders, mapCustomerOrder, mapCustomerOrders } from '../mappers/http-mappers';

@Injectable()
export class OrderHttpRepository implements IOrderRepository {
  constructor(private readonly http: HttpClient) {}

  listMine(): Observable<readonly CustomerOrder[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/customer/orders`)
      .pipe(map((body) => mapCustomerOrders(readApiBody<unknown>(body))));
  }

  readMine(orderId: string): Observable<CustomerOrder> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/customer/orders/${orderId}`)
      .pipe(map((body) => mapCustomerOrder(readApiBody<unknown>(body))));
  }

  listAdmin(): Observable<readonly AdminOrder[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/orders`)
      .pipe(map((body) => mapAdminOrders(readApiBody<unknown>(body))));
  }

  readAdmin(orderId: string): Observable<AdminOrder> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/orders/${orderId}`)
      .pipe(map((body) => mapAdminOrder(readApiBody<unknown>(body))));
  }

  advanceShipment(orderId: string, status: ShipmentTransition, tracking: string | null): Observable<AdminOrder> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/user/orders/${orderId}/shipments`, { status: status.wire, tracking })
      .pipe(map((body) => mapAdminOrder(readApiBody<unknown>(body))));
  }

  advanceRma(orderId: string, status: RmaTransition): Observable<AdminOrder> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/user/orders/${orderId}/rma`, { status: status.wire })
      .pipe(map((body) => mapAdminOrder(readApiBody<unknown>(body))));
  }
}
