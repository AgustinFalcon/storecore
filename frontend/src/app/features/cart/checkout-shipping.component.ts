import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CheckoutShippingStore } from './checkout-shipping.store';
import { CheckoutShippingViewComponent } from './checkout-shipping.view';

@Component({
  selector: 'sc-checkout-shipping',
  imports: [AsyncPipe, CheckoutShippingViewComponent],
  providers: [CheckoutShippingStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-checkout-shipping-view [state]="state" (choose)="store.choose($event)" (pin)="store.mark($event)" (retry)="store.load()" />
    }
  `,
})
export class CheckoutShippingComponent implements OnInit {
  constructor(readonly store: CheckoutShippingStore) {}

  ngOnInit(): void {
    this.store.load();
  }
}
