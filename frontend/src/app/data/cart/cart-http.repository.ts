import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { Cart, CheckoutCommand, CheckoutReceipt } from '../../domain/cart/cart.entity';
import { ICartRepository } from '../../domain/cart/cart.repository';
import { mapCart, mapReceipt } from '../mappers/http-mappers';

@Injectable()
export class CartHttpRepository implements ICartRepository {
  constructor(private readonly http: HttpClient) {}

  read(): Observable<Cart> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/customer/cart`)
      .pipe(map((body) => mapCart(readApiBody<unknown>(body))));
  }

  addLine(sku: string, quantity: number): Observable<Cart> {
    return this.http
      .put<unknown>(`${environment.apiBaseUrl}/customer/cart/items`, { sku, quantity })
      .pipe(map((body) => mapCart(readApiBody<unknown>(body))));
  }

  checkout(command: CheckoutCommand): Observable<CheckoutReceipt> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/customer/checkout`, command)
      .pipe(map((body) => mapReceipt(readApiBody<unknown>(body))));
  }
}
