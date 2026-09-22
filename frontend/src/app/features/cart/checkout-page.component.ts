import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CheckoutPageViewComponent } from './checkout-page.view';
import { CartStore } from './cart.store';

@Component({
  selector: 'sc-checkout-page',
  imports: [AsyncPipe, CheckoutPageViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-checkout-page-view
        [state]="state"
        (addressChange)="store.setAddressId($event)"
        (currencyChange)="store.setCurrency($event)"
        (pay)="store.submitCheckout()"
      />
    }
  `,
})
export class CheckoutPageComponent implements OnInit {
  constructor(readonly store: CartStore) {}

  ngOnInit(): void {
    this.store.load();
    this.store.loadAddresses();
  }
}
