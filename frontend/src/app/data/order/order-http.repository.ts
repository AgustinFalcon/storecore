import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { AdminOrder, CustomerOrder, RmaTransition, ShipmentTransition } from '../../domain/order/order.entity';
import { IOrderRepository } from '../../domain/order/order.repository';
import { mapAdminOrder, mapCustomerOrder, mapOrderPage } from '../mappers/http-mappers';
import { firstOrderPage, OrderPage, OrderQuery } from '../../domain/order/order-projection';

@Injectable()
export class OrderHttpRepository implements IOrderRepository {
  constructor(private readonly http: HttpClient) {}

  private params(query: OrderQuery): Record<string, string | number> {
    const params: Record<string, string | number> = { page: query.page, size: query.size };
    if (query.orderStatus) params['orderStatus'] = query.orderStatus.wire;
    if (query.paymentStatus) params['paymentStatus'] = query.paymentStatus.wire;
    if (query.shipmentStatus) params['shipmentStatus'] = query.shipmentStatus.wire;
    return params;
  }

  listMine(query: OrderQuery = firstOrderPage): Observable<OrderPage<CustomerOrder>> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/customer/orders`, { params: this.params(query) })
      .pipe(map((body) => mapOrderPage(readApiBody<unknown>(body), mapCustomerOrder)));
  }

  readMine(orderId: string): Observable<CustomerOrder> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/customer/orders/${orderId}`)
      .pipe(map((body) => mapCustomerOrder(readApiBody<unknown>(body))));
  }

  listAdmin(query: OrderQuery = firstOrderPage): Observable<OrderPage<AdminOrder>> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/orders`, { params: this.params(query) })
      .pipe(map((body) => mapOrderPage(readApiBody<unknown>(body), mapAdminOrder)));
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
