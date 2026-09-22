import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { AdminOrder, RmaTransition, ShipmentTransition } from '../../domain/order/order.entity';
import { AdvanceFulfillmentUseCase } from '../../domain/order/use-cases/advance-fulfillment.usecase';
import { GetAdminOrderUseCase } from '../../domain/order/use-cases/get-admin-order.usecase';

export interface UserOrderDetailState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly order: AdminOrder | null;
}

@Injectable()
export class UserOrderDetailStore extends ComponentStore<UserOrderDetailState> {
  constructor(
    private readonly getAdmin: GetAdminOrderUseCase,
    private readonly advance: AdvanceFulfillmentUseCase,
  ) {
    super({ loading: false, errorMessage: '', order: null });
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly order$ = this.select((s) => s.order);

  readonly load = this.effect<string>((id$) =>
    id$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '', order: null })),
      switchMap((orderId) =>
        this.getAdmin.execute(orderId).pipe(
          tapResponse({
            next: (order) => this.patchState({ order, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly ship = this.effect<{ orderId: string; status: ShipmentTransition; tracking: string | null }>((cmd$) =>
    cmd$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap((cmd) =>
        this.advance.ship(cmd.orderId, cmd.status, cmd.tracking).pipe(
          tapResponse({
            next: (order) => this.patchState({ order, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly rma = this.effect<{ orderId: string; status: RmaTransition }>((cmd$) =>
    cmd$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap((cmd) =>
        this.advance.rma(cmd.orderId, cmd.status).pipe(
          tapResponse({
            next: (order) => this.patchState({ order, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
