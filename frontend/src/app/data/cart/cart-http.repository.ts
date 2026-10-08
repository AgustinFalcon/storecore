import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { defer, map, Observable, throwError } from 'rxjs';
import { CustomerSession } from '../../core/auth/customer-session';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { Cart, CheckoutCommand, CheckoutReceipt } from '../../domain/cart/cart.entity';
import { ICartRepository } from '../../domain/cart/cart.repository';
import { mapCart, mapReceipt } from '../mappers/http-mappers';

@Injectable()
export class CartHttpRepository implements ICartRepository {
  constructor(private readonly http: HttpClient, private readonly session: CustomerSession, private readonly access: AccessCoordinator) {}

  read(): Observable<Cart> {
    return this.authorized(() => this.http
      .get<unknown>(`${environment.apiBaseUrl}/customer/cart`)
      .pipe(map((body) => mapCart(readApiBody<unknown>(body)))));
  }

  addLine(sku: string, quantity: number): Observable<Cart> {
    return this.authorized(() => this.http
      .put<unknown>(`${environment.apiBaseUrl}/customer/cart/items`, { sku, quantity })
      .pipe(map((body) => mapCart(readApiBody<unknown>(body)))));
  }

  checkout(command: CheckoutCommand): Observable<CheckoutReceipt> {
    return this.authorized(() => this.http
      .post<unknown>(`${environment.apiBaseUrl}/customer/checkout`, command)
      .pipe(map((body) => mapReceipt(readApiBody<unknown>(body)))));
  }

  private authorized<T>(request: () => Observable<T>): Observable<T> {
    return defer(() => {
      const policy = CustomerCartAccess.resolve(this.access.state(), this.session.authenticated() ? this.session.actorId() : null);
      return policy.canMutate ? request() : throwError(() => new Error(policy.label));
    });
  }
}
