import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CustomerOrder } from '../../domain/order/order.entity';
import { GetMyOrderUseCase } from '../../domain/order/use-cases/get-my-order.usecase';
import { ShippingSelection } from '../../domain/shipping/shipping.entity';
import { GetShippingSelectionUseCase } from '../../domain/shipping/use-cases/get-shipping-selection.usecase';

export interface CustomerOrderDetailState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly order: CustomerOrder | null;
  readonly shipping: ShippingSelection | null;
  readonly shippingError: string;
}

@Injectable()
export class CustomerOrderDetailStore extends ComponentStore<CustomerOrderDetailState> {
  constructor(
    private readonly getMine: GetMyOrderUseCase,
    private readonly getShipping: GetShippingSelectionUseCase,
  ) {
    super({
      loading: false,
      errorMessage: '',
      order: null,
      shipping: null,
      shippingError: '',
    });
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly order$ = this.select((s) => s.order);
  readonly shipping$ = this.select((s) => s.shipping);
  readonly shippingError$ = this.select((s) => s.shippingError);

  readonly load = this.effect<string>((id$) =>
    id$.pipe(
      tap(() =>
        this.patchState({
          loading: true,
          errorMessage: '',
          order: null,
          shipping: null,
          shippingError: '',
        }),
      ),
      switchMap((orderId) =>
        forkJoin({
          order: this.getMine.execute(orderId),
          shipping: this.getShipping.execute().pipe(
            map((selection) => ({ selection, errorMessage: '' })),
            catchError((err: unknown) => of({ selection: null, errorMessage: getApiErrorMessage(err) })),
          ),
        }).pipe(
          tapResponse({
            next: ({ order, shipping }) =>
              this.patchState({
                order,
                shipping: shipping.selection,
                shippingError: shipping.errorMessage,
                loading: false,
              }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
