import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { firstOrderPage, OrderQuery } from '../../domain/order/order-projection';
import { CustomerOrder } from '../../domain/order/order.entity';
import { ListMyOrdersUseCase } from '../../domain/order/use-cases/list-my-orders.usecase';

export interface CustomerOrdersState {
  readonly query: OrderQuery;
  readonly total: number;
  readonly truncated: boolean;
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly orders: readonly CustomerOrder[];
}

@Injectable()
export class CustomerOrdersStore extends ComponentStore<CustomerOrdersState> {
  constructor(private readonly listMine: ListMyOrdersUseCase) {
    super({ loading: false, errorMessage: '', orders: [], query: firstOrderPage, total: 0, truncated: false });
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly orders$ = this.select((s) => s.orders);
  readonly query$ = this.select((s) => s.query);
  readonly total$ = this.select((s) => s.total);
  readonly truncated$ = this.select((s) => s.truncated);
  changeQuery(query: OrderQuery): void { this.patchState({ query }); this.load(); }
  readonly empty$ = this.select((s) => !s.loading && s.orders.length === 0);

  readonly load = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '', orders: [] })),
      switchMap(() =>
        this.listMine.execute(this.get().query).pipe(
          tapResponse({
            next: (page) => this.patchState({ orders: page.items, total: page.total, truncated: page.truncated, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
