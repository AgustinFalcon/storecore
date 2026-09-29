import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CustomerOrderDetailViewComponent } from './customer-order-detail.view';
import { CustomerOrderDetailStore } from './customer-order-detail.store';

@Component({
  selector: 'sc-customer-order-detail',
  imports: [AsyncPipe, CustomerOrderDetailViewComponent],
  providers: [CustomerOrderDetailStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-customer-order-detail-view
      [order]="store.order$ | async"
      [shipping]="store.shipping$ | async"
      [shippingError]="(store.shippingError$ | async) ?? ''"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) ?? ''"
      (retry)="reload()"
    />
  `,
})
export class CustomerOrderDetailComponent implements OnInit {
  constructor(
    readonly store: CustomerOrderDetailStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.store.load(this.route.snapshot.paramMap.get('id') ?? '');
  }
}
