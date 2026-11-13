import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { skip } from 'rxjs';
import { CustomerSession } from '../../core/auth/customer-session';
import { AddressReturnTarget } from '../../domain/customer/address-return-target';
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
        [returnTarget]="returnTarget()"
        (draftChange)="store.setAddressDraft($event)"
        (save)="store.persistAddress()"
        (remove)="store.removeAddress($event)"
        (clearDraft)="store.clearAddressDraft()"
        (retry)="store.loadAddresses()"
      />
    }
  `,
})
export class CustomerAddressesComponent implements OnInit {
  readonly returnTarget = signal(AddressReturnTarget.Unknown);

  constructor(readonly store: CustomerStore, private readonly route: ActivatedRoute,
    private readonly session: CustomerSession, private readonly destroyRef: DestroyRef) {}

  ngOnInit(): void {
    this.session.actorChanges$.pipe(skip(1), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.returnTarget.set(AddressReturnTarget.Unknown);
      this.store.loadAddresses();
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.returnTarget.set(AddressReturnTarget.fromWire(params.get('returnTo')));
    });
    this.store.loadAddresses();
  }
}
