import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { GetBillingProfileUseCase } from '../../domain/billing/use-cases/get-billing-profile.usecase';
import { DocumentStatus } from '../../domain/order/closed-status';
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
  readonly documentStatus: DocumentStatus | null;
}

@Injectable()
export class CustomerOrderDetailStore extends ComponentStore<CustomerOrderDetailState> {
  constructor(
    private readonly getMine: GetMyOrderUseCase,
    private readonly getShipping: GetShippingSelectionUseCase,
    private readonly getBilling: GetBillingProfileUseCase,
  ) {
    super({
      loading: false,
      errorMessage: '',
      order: null,
      shipping: null,
      shippingError: '',
      documentStatus: null,
    });
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly order$ = this.select((s) => s.order);
  readonly shipping$ = this.select((s) => s.shipping);
  readonly shippingError$ = this.select((s) => s.shippingError);
  readonly documentStatus$ = this.select((s) => s.documentStatus);

  readonly load = this.effect<string>((id$) =>
    id$.pipe(
      tap(() =>
        this.patchState({
          loading: true,
          errorMessage: '',
          order: null,
          shipping: null,
          shippingError: '',
          documentStatus: null,
        }),
      ),
      switchMap((orderId) =>
        forkJoin({
          order: this.getMine.execute(orderId),
          shipping: this.getShipping.execute().pipe(
            map((selection) => ({ selection, errorMessage: '' })),
            catchError((err: unknown) => of({ selection: null, errorMessage: getApiErrorMessage(err) })),
          ),
          billing: this.getBilling.execute().pipe(
            map((profile) => profile.documentStatus),
            catchError(() => of(DocumentStatus.Unknown)),
          ),
        }).pipe(
          tapResponse({
            next: ({ order, shipping, billing }) =>
              this.patchState({
                order,
                shipping: shipping.selection,
                shippingError: shipping.errorMessage,
                documentStatus: billing,
                loading: false,
              }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
