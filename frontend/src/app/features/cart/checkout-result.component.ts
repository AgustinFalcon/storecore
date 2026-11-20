import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { CustomerOrderDetailStore } from '../orders/customer-order-detail.store';
import { CustomerOrderRefreshPhase } from '../orders/customer-order-refresh';
import { CheckoutResultViewComponent } from './checkout-result.view';

@Component({
  selector: 'sc-checkout-result',
  imports: [AsyncPipe, CheckoutResultViewComponent],
  providers: [CustomerOrderDetailStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-checkout-result-view
      [order]="store.order$ | async"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) ?? ''"
      [refreshPhase]="(store.refreshPhase$ | async) ?? Phase.Unknown"
      (retry)="reload()"
      (refresh)="refresh()"
    />
  `,
})
export class CheckoutResultComponent implements OnInit {
  readonly Phase = CustomerOrderRefreshPhase;
  private readonly destroyRef = inject(DestroyRef);
  constructor(
    readonly store: CustomerOrderDetailStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(
      map((params) => params.get('orderId') ?? ''),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((id) => this.store.load(id));
  }

  reload(): void {
    this.store.load(this.route.snapshot.paramMap.get('orderId') ?? '');
  }

  refresh(): void {
    this.store.refresh(this.route.snapshot.paramMap.get('orderId') ?? '');
  }
}
