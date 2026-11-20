import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CustomerOrder } from '../../domain/order/order.entity';
import { GetMyOrderUseCase } from '../../domain/order/use-cases/get-my-order.usecase';
import { CustomerOrderReadCommand, CustomerOrderReadMode, CustomerOrderRefreshPhase } from './customer-order-refresh';

export interface CustomerOrderDetailState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly order: CustomerOrder | null;
  readonly refreshPhase: CustomerOrderRefreshPhase;
}

@Injectable()
export class CustomerOrderDetailStore extends ComponentStore<CustomerOrderDetailState> {
  constructor(private readonly getMine: GetMyOrderUseCase) {
    super({ loading: false, errorMessage: '', order: null, refreshPhase: CustomerOrderRefreshPhase.Idle });
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly order$ = this.select((s) => s.order);
  readonly refreshPhase$ = this.select((s) => s.refreshPhase);

  get snapshot(): CustomerOrderDetailState {
    return this.get((state) => state);
  }

  private readonly read = this.effect<CustomerOrderReadCommand>((command$) =>
    command$.pipe(
      tap((command) => this.begin(command)),
      switchMap((command) =>
        this.getMine.execute(command.orderId).pipe(
          tapResponse({
            next: (order) => this.patchState({
              order,
              loading: false,
              refreshPhase: command.mode === CustomerOrderReadMode.Refresh
                ? CustomerOrderRefreshPhase.Succeeded
                : CustomerOrderRefreshPhase.Idle,
            }),
            error: (err: unknown) => this.patchState({
              loading: false,
              errorMessage: getApiErrorMessage(err),
              refreshPhase: command.mode === CustomerOrderReadMode.Refresh
                ? CustomerOrderRefreshPhase.Failed
                : CustomerOrderRefreshPhase.Idle,
            }),
          }),
        ),
      ),
    ),
  );

  load(orderId: string): void {
    this.read(CustomerOrderReadCommand.initial(orderId));
  }

  refresh(orderId: string): void {
    const state = this.snapshot;
    if (state.refreshPhase.busy || state.order?.paymentStatus.permitsAuthoritativeRefresh !== true) return;
    this.read(CustomerOrderReadCommand.refresh(orderId));
  }

  private begin(command: CustomerOrderReadCommand): void {
    if (command.mode === CustomerOrderReadMode.Refresh) {
      this.patchState({ errorMessage: '', refreshPhase: CustomerOrderRefreshPhase.Refreshing });
      return;
    }
    this.patchState({ loading: true, errorMessage: '', order: null, refreshPhase: CustomerOrderRefreshPhase.Idle });
  }
}
