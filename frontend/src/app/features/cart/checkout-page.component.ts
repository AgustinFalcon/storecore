import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CheckoutPageViewComponent } from './checkout-page.view';
import { CartFailureKind, CartStore } from './cart.store';

@Component({
  selector: 'sc-checkout-page',
  imports: [AsyncPipe, CheckoutPageViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-checkout-page-view
        [state]="state"
        [access]="store.authority()"
        (selectCustomer)="store.selectCustomer()"
        (addressChange)="store.setAddressId($event)"
        (currencyChange)="store.setCurrency($event)"
        (pay)="store.submitCheckout()"
        (retry)="retry()"
      />
    }
  `,
})
export class CheckoutPageComponent implements OnInit {
  constructor(readonly store: CartStore) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.store.load();
    this.store.loadAddresses();
  }

  retry(): void {
    if (this.store.snapshot.failureKind === CartFailureKind.CheckoutRetryable) {
      this.store.submitCheckout();
      return;
    }
    this.reload();
  }
}
