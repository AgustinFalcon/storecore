import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CustomerOrder } from '../../domain/order/order.entity';
import { GetMyOrderUseCase } from '../../domain/order/use-cases/get-my-order.usecase';

export interface CustomerOrderDetailState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly order: CustomerOrder | null;
}

@Injectable()
export class CustomerOrderDetailStore extends ComponentStore<CustomerOrderDetailState> {
  constructor(private readonly getMine: GetMyOrderUseCase) {
    super({ loading: false, errorMessage: '', order: null });
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly order$ = this.select((s) => s.order);

  readonly load = this.effect<string>((id$) =>
    id$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '', order: null })),
      switchMap((orderId) =>
        this.getMine.execute(orderId).pipe(
          tapResponse({
            next: (order) => this.patchState({ order, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
