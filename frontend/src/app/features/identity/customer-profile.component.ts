import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CustomerProfileViewComponent } from './customer-profile.view';
import { CustomerStore } from './customer.store';

@Component({
  selector: 'sc-customer-profile',
  imports: [AsyncPipe, CustomerProfileViewComponent],
  providers: [CustomerStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-customer-profile-view
        [state]="state"
        (profileChange)="store.setProfile($event)"
        (save)="store.persistProfile()"
      />
    }
  `,
})
export class CustomerProfileComponent implements OnInit {
  constructor(readonly store: CustomerStore) {}

  ngOnInit(): void {
    this.store.loadProfile();
  }
}
