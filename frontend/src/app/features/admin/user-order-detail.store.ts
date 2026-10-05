import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { defer, filter, finalize, mergeMap, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { AdminOrder, RmaTransition, ShipmentTransition } from '../../domain/order/order.entity';
import { AdvanceFulfillmentUseCase } from '../../domain/order/use-cases/advance-fulfillment.usecase';
import { GetAdminOrderUseCase } from '../../domain/order/use-cases/get-admin-order.usecase';

export interface UserOrderDetailState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly order: AdminOrder | null;
  readonly mutatingOrderIds: readonly string[];
}

@Injectable()
export class UserOrderDetailStore extends ComponentStore<UserOrderDetailState> {
  private currentOrderId = '';
  private routeGeneration = 0;
  private destroyed = false;
  constructor(
    private readonly getAdmin: GetAdminOrderUseCase,
    private readonly advance: AdvanceFulfillmentUseCase,
  ) {
    super({ loading: false, errorMessage: '', order: null, mutatingOrderIds: [] });
  }

  readonly loading$ = this.select((s) => s.loading || (s.order !== null && s.mutatingOrderIds.includes(s.order.id)));
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly order$ = this.select((s) => s.order);

  readonly load = this.effect<string>((id$) =>
    id$.pipe(
      tap((orderId) => {
        this.currentOrderId = orderId;
        this.routeGeneration++;
        this.patchState({ loading: true, errorMessage: '', order: null });
      }),
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
      filter((cmd) => this.canMutate(cmd.orderId)),
      tap((cmd) => this.beginMutation(cmd.orderId)),
      mergeMap((cmd) => {
        const generation = this.routeGeneration;
        return defer(() => this.advance.ship(cmd.orderId, cmd.status, cmd.tracking)).pipe(
          tapResponse({
            next: (order) => {
              if (generation === this.routeGeneration) this.patchState({ order });
            },
            error: (err: unknown) => {
              if (generation === this.routeGeneration) this.patchState({ errorMessage: getApiErrorMessage(err) });
            },
          }),
          finalize(() => this.finishMutation(cmd.orderId, generation)),
        );
      }),
    ),
  );

  readonly rma = this.effect<{ orderId: string; status: RmaTransition }>((cmd$) =>
    cmd$.pipe(
      filter((cmd) => this.canMutate(cmd.orderId)),
      tap((cmd) => this.beginMutation(cmd.orderId)),
      mergeMap((cmd) => {
        const generation = this.routeGeneration;
        return defer(() => this.advance.rma(cmd.orderId, cmd.status)).pipe(
          tapResponse({
            next: (order) => {
              if (generation === this.routeGeneration) this.patchState({ order });
            },
            error: (err: unknown) => {
              if (generation === this.routeGeneration) this.patchState({ errorMessage: getApiErrorMessage(err) });
            },
          }),
          finalize(() => this.finishMutation(cmd.orderId, generation)),
        );
      }),
    ),
  );

  private canMutate(orderId: string): boolean {
    return this.get((state) => !state.loading && !state.mutatingOrderIds.includes(orderId) &&
      state.order?.id === orderId && this.currentOrderId === orderId);
  }

  private beginMutation(orderId: string): void {
    this.patchState((state) => ({ mutatingOrderIds: [...state.mutatingOrderIds, orderId], errorMessage: '' }));
  }

  private finishMutation(orderId: string, generation: number): void {
    // A read made after returning to A may predate A's commit. Replace it with a fresh read
    // before releasing the busy state, including failures with an uncertain server outcome.
    if (!this.destroyed && this.currentOrderId === orderId && generation !== this.routeGeneration) {
      this.load(orderId);
    }
    this.patchState((state) => ({ mutatingOrderIds: state.mutatingOrderIds.filter((id) => id !== orderId) }));
  }

  override ngOnDestroy(): void {
    this.destroyed = true;
    super.ngOnDestroy();
  }
}
