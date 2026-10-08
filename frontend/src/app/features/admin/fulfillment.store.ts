import { Injectable } from '@angular/core';
import { UserSession } from '../../core/auth/user-session';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { switchMap, takeUntil, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { AdminOrder, RmaTransition, ShipmentTransition } from '../../domain/order/order.entity';
import { AdvanceFulfillmentUseCase } from '../../domain/order/use-cases/advance-fulfillment.usecase';
import { ListAdminOrdersUseCase } from '../../domain/order/use-cases/list-admin-orders.usecase';

export interface FulfillmentState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly orders: readonly AdminOrder[];
}

@Injectable()
export class FulfillmentStore extends ComponentStore<FulfillmentState> {
  constructor(
    private readonly listAdmin: ListAdminOrdersUseCase,
    private readonly advance: AdvanceFulfillmentUseCase,
    private readonly session: UserSession = new UserSession(),
  ) {
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
        this.listAdmin.execute().pipe(
          takeUntil(this.session.actorChanges$),
          tapResponse({
            next: (orders) => this.patchState({ orders, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly ship = this.effect<{ orderId: string; status: ShipmentTransition; tracking: string | null }>((cmd$) =>
    cmd$.pipe(
      switchMap((cmd) =>
        this.advance.ship(cmd.orderId, cmd.status, cmd.tracking).pipe(
          takeUntil(this.session.actorChanges$),
          tapResponse({
            next: () => this.load(),
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly rma = this.effect<{ orderId: string; status: RmaTransition }>((cmd$) =>
    cmd$.pipe(
      switchMap((cmd) =>
        this.advance.rma(cmd.orderId, cmd.status).pipe(
          takeUntil(this.session.actorChanges$),
          tapResponse({
            next: () => this.load(),
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
