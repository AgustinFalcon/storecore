import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CustomerAddressesViewComponent } from './customer-addresses.view';
import { CustomerStore } from './customer.store';

@Component({
  selector: 'sc-customer-addresses',
  imports: [AsyncPipe, CustomerAddressesViewComponent],
  providers: [CustomerStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-customer-addresses-view
        [state]="state"
        (draftChange)="store.setAddressDraft($event)"
        (save)="store.persistAddress()"
        (remove)="store.removeAddress($event)"
        (clearDraft)="store.clearAddressDraft()"
      />
    }
  `,
})
export class CustomerAddressesComponent implements OnInit {
  constructor(readonly store: CustomerStore) {}

  ngOnInit(): void {
    this.store.loadAddresses();
  }
}
