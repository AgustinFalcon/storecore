import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CustomerOrderDetailStore } from '../orders/customer-order-detail.store';
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
      (retry)="reload()"
    />
  `,
})
export class CheckoutResultComponent implements OnInit {
  constructor(
    readonly store: CustomerOrderDetailStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.store.load(this.route.snapshot.paramMap.get('orderId') ?? '');
  }
}
