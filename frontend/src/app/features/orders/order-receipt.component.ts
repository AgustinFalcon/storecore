import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { OrderReceiptStore } from './order-receipt.store';
import { OrderReceiptViewComponent } from './order-receipt.view';

@Component({
  selector: 'sc-order-receipt',
  imports: [AsyncPipe, OrderReceiptViewComponent],
  providers: [OrderReceiptStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-order-receipt-view
        [order]="state.order"
        [profile]="state.profile"
        [loading]="state.loading"
        [error]="state.errorMessage"
        [notice]="state.notice"
        (legalNameChange)="store.patchProfile({ legalName: $event })"
        (taxIdChange)="store.patchProfile({ taxId: $event })"
        (conditionChange)="store.setCondition($event)"
        (save)="store.save()"
        (retry)="reload()"
      />
    }
  `,
})
export class OrderReceiptComponent implements OnInit {
  constructor(
    readonly store: OrderReceiptStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.store.load(this.route.snapshot.paramMap.get('id') ?? '');
  }
}
