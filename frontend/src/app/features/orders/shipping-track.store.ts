import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { EMPTY, forkJoin, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { GetMyOrderUseCase } from '../../domain/order/use-cases/get-my-order.usecase';
import { quoteShipping } from '../../domain/shipping/shipping-quote';
import { ShippingChoice } from '../../domain/order/closed-status';
import { ShippingSelection, ShippingSimStatus, ShippingStep } from '../../domain/shipping/shipping.entity';
import { nextSimStatus, shippingSteps } from '../../domain/shipping/shipping-timeline';
import { AdvanceShippingSimulationUseCase } from '../../domain/shipping/use-cases/advance-shipping-simulation.usecase';
import { GetShippingSelectionUseCase } from '../../domain/shipping/use-cases/get-shipping-selection.usecase';

export interface ShippingTrackState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly orderId: string;
  readonly optionId: ShippingChoice | null;
  readonly optionName: string;
  readonly status: ShippingSimStatus;
  readonly steps: readonly ShippingStep[];
  readonly canAdvance: boolean;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly originLatitude: number | null;
  readonly originLongitude: number | null;
}

const INITIAL: ShippingTrackState = {
  loading: false,
  errorMessage: '',
  orderId: '',
  optionId: null,
  optionName: '',
  status: ShippingSimStatus.Unknown,
  steps: [],
  canAdvance: false,
  latitude: null,
  longitude: null,
  originLatitude: null,
  originLongitude: null,
};

@Injectable()
export class ShippingTrackStore extends ComponentStore<ShippingTrackState> {
  constructor(
    private readonly getOrder: GetMyOrderUseCase,
    private readonly getSelection: GetShippingSelectionUseCase,
    private readonly advanceSimulation: AdvanceShippingSimulationUseCase,
  ) {
    super(INITIAL);
  }

  readonly load = this.effect<string>((id$) =>
    id$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap((orderId) =>
        forkJoin({
          order: this.getOrder.execute(orderId),
          selection: this.getSelection.execute(),
        }).pipe(
          tapResponse({
            next: ({ order, selection }) => this.show(order.id, selection),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly advance = this.effect<void>((trigger$) =>
    trigger$.pipe(
      switchMap(() => {
        const current = this.get((state) => state);
        if (!current.optionId || !current.canAdvance) {
          return EMPTY;
        }
        const next = nextSimStatus(current.optionId, current.status);
        if (!next) {
          return EMPTY;
        }
        return this.advanceSimulation.execute(next).pipe(
          tapResponse({
            next: (selection) => this.show(current.orderId, selection),
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        );
      }),
    ),
  );

  private show(orderId: string, selection: ShippingSelection): void {
    const optionId = selection.optionId;
    const option = quoteShipping(0).find((item) => item.id === optionId);
    this.patchState({
      loading: false,
      orderId,
      optionId,
      optionName: option?.name ?? '',
      status: selection.status,
      steps: optionId ? shippingSteps(optionId, selection.status, new Date()) : [],
      canAdvance: optionId ? nextSimStatus(optionId, selection.status) !== null : false,
      latitude: selection.latitude,
      longitude: selection.longitude,
      originLatitude: selection.originLatitude,
      originLongitude: selection.originLongitude,
    });
  }
}
