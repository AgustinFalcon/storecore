import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FulfillmentViewComponent } from './fulfillment.view';
import { FulfillmentStore } from './fulfillment.store';

@Component({
  selector: 'sc-fulfillment',
  imports: [AsyncPipe, FulfillmentViewComponent],
  providers: [FulfillmentStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-fulfillment-view
      [orders]="(store.orders$ | async) ?? []"
      [query]="(store.query$ | async)!"
      [total]="(store.total$ | async) ?? 0"
      [truncated]="(store.truncated$ | async) ?? false"
      (queryChange)="store.changeQuery($event)"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) ?? ''"
      (ship)="store.ship($event)"
      (rma)="store.rma($event)"
      (retry)="store.load()"
    />
  `,
})
export class FulfillmentComponent implements OnInit {
  constructor(readonly store: FulfillmentStore) {}

  ngOnInit(): void {
    this.store.load();
  }
}
