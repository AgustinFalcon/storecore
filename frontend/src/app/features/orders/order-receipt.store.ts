import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { forkJoin, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { BillingProfile, EMPTY_BILLING, TaxCondition } from '../../domain/billing/billing.entity';
import { GetBillingProfileUseCase } from '../../domain/billing/use-cases/get-billing-profile.usecase';
import { SaveBillingProfileUseCase } from '../../domain/billing/use-cases/save-billing-profile.usecase';
import { CustomerOrder } from '../../domain/order/order.entity';
import { GetMyOrderUseCase } from '../../domain/order/use-cases/get-my-order.usecase';

export interface OrderReceiptState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly notice: string;
  readonly order: CustomerOrder | null;
  readonly profile: BillingProfile;
}

@Injectable()
export class OrderReceiptStore extends ComponentStore<OrderReceiptState> {
  constructor(
    private readonly getOrder: GetMyOrderUseCase,
    private readonly getBilling: GetBillingProfileUseCase,
    private readonly saveBilling: SaveBillingProfileUseCase,
  ) {
    super({ loading: false, errorMessage: '', notice: '', order: null, profile: EMPTY_BILLING });
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly notice$ = this.select((s) => s.notice);
  readonly order$ = this.select((s) => s.order);
  readonly profile$ = this.select((s) => s.profile);

  readonly patchProfile = this.updater((s, partial: Partial<BillingProfile>) => ({
    ...s,
    profile: { ...s.profile, ...partial, documentStatus: s.profile.documentStatus },
  }));

  readonly load = this.effect<string>((id$) =>
    id$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '', notice: '' })),
      switchMap((orderId) =>
        forkJoin({
          order: this.getOrder.execute(orderId),
          profile: this.getBilling.execute(),
        }).pipe(
          tapResponse({
            next: ({ order, profile }) => this.patchState({ order, profile, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly save = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '', notice: '' })),
      switchMap(() => {
        const profile = this.get((s) => s.profile);
        return this.saveBilling.execute({
          legalName: profile.legalName.trim(),
          taxId: profile.taxId.trim(),
          taxCondition: profile.taxCondition,
        }).pipe(
          tapResponse({
            next: (saved) => this.patchState({ profile: saved, loading: false, notice: 'Datos guardados. El comprobante queda emitido cuando el servicio fiscal lo marca.' }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        );
      }),
    ),
  );

  setCondition(value: string): void {
    const allowed: readonly TaxCondition[] = ['CONSUMIDOR_FINAL', 'MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO'];
    const taxCondition = allowed.find((item) => item === value) ?? 'CONSUMIDOR_FINAL';
    this.patchProfile({ taxCondition });
  }
}
