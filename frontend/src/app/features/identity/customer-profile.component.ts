import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CustomerProfileViewComponent } from './customer-profile.view';
import { CustomerStore } from './customer.store';
import { EmailOwnershipComponent } from './email-ownership.component';
import { RecoveryRealm } from '../../domain/access/recovery';

@Component({
  selector: 'sc-customer-profile',
  imports: [AsyncPipe, CustomerProfileViewComponent, EmailOwnershipComponent],
  providers: [CustomerStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-customer-profile-view
        [state]="state"
        (profileChange)="store.setProfile($event)"
        (save)="store.persistProfile()"
        (retry)="store.loadProfile()"
      />
      <div class="sc-page sc-auth"><div class="sc-auth__card"><sc-email-ownership [realm]="realm" [revision]="state.profileRevision" /></div></div>
    }
  `,
})
export class CustomerProfileComponent implements OnInit {
  readonly realm = RecoveryRealm.Customer;
  constructor(readonly store: CustomerStore) {}

  ngOnInit(): void {
    this.store.loadProfile();
  }
}
