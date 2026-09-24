import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CustomerOrdersViewComponent } from './customer-orders.view';
import { CustomerOrdersStore } from './customer-orders.store';

@Component({
  selector: 'sc-customer-orders',
  imports: [AsyncPipe, CustomerOrdersViewComponent],
  providers: [CustomerOrdersStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-customer-orders-view
      [orders]="(store.orders$ | async) ?? []"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) ?? ''"
      (retry)="store.load()"
    />
  `,
})
export class CustomerOrdersComponent implements OnInit {
  constructor(readonly store: CustomerOrdersStore) {}

  ngOnInit(): void {
    this.store.load();
  }
}
