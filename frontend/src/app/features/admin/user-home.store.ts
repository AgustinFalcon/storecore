import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { OperatorOverview, OverviewPeriod } from '../../domain/overview/overview';
import { ReadOverviewUseCase } from '../../domain/overview/use-cases/read-overview.usecase';
export interface UserHomeState { readonly loading: boolean; readonly period: OverviewPeriod; readonly overview: OperatorOverview | null; readonly errorMessage: string; }
const INITIAL: UserHomeState = { loading: false, period: OverviewPeriod.Today, overview: null, errorMessage: '' };
@Injectable()
export class UserHomeStore extends ComponentStore<UserHomeState> {
  readonly vm$ = this.select((state) => state);
  constructor(private readonly readOverview: ReadOverviewUseCase) { super(INITIAL); }
  readonly load = this.effect<OverviewPeriod>((period$) => period$.pipe(
    tap((period) => this.patchState({ loading: true, period, errorMessage: '' })),
    switchMap((period) => this.readOverview.execute(period).pipe(tapResponse({
      next: (overview) => this.patchState((state) => state.period === period ? { overview, loading: false } : {}),
      error: (error: unknown) => this.patchState((state) => state.period === period ? { overview: null, loading: false, errorMessage: getApiErrorMessage(error) } : {}),
    }))),
  ));
}
