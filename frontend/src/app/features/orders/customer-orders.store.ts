import { Injectable } from '@angular/core';
import { CustomerSession } from '../../core/auth/customer-session';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { switchMap, takeUntil, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CustomerOrder } from '../../domain/order/order.entity';
import { ListMyOrdersUseCase } from '../../domain/order/use-cases/list-my-orders.usecase';

export interface CustomerOrdersState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly orders: readonly CustomerOrder[];
}

@Injectable()
export class CustomerOrdersStore extends ComponentStore<CustomerOrdersState> {
  constructor(private readonly listMine: ListMyOrdersUseCase, private readonly session: CustomerSession = new CustomerSession()) {
    super({ loading: false, errorMessage: '', orders: [] });
    const initial = this.get();
    this.effect<void>(changes => changes.pipe(tap(() => {
      this.setState(initial);
    })))(session.actorChanges$);
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly orders$ = this.select((s) => s.orders);
  readonly empty$ = this.select((s) => !s.loading && s.orders.length === 0);

  readonly load = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.listMine.execute().pipe(
          takeUntil(this.session.actorChanges$),
          tapResponse({
            next: (orders) => this.patchState({ orders, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
