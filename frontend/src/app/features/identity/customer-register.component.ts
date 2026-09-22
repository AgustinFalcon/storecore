import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CustomerSession } from '../../core/auth/customer-session';
import { CustomerRegisterViewComponent } from './customer-register.view';
import { CustomerStore } from './customer.store';

@Component({
  selector: 'sc-customer-register',
  imports: [AsyncPipe, CustomerRegisterViewComponent],
  providers: [CustomerStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-customer-register-view
        [state]="state"
        [authenticated]="session.authenticated()"
        (firstNameChange)="store.setFirstName($event)"
        (lastNameChange)="store.setLastName($event)"
        (emailChange)="store.setEmail($event)"
        (passwordChange)="store.setPassword($event)"
        (submitRegister)="store.submitRegister()"
      />
    }
  `,
})
export class CustomerRegisterComponent {
  constructor(
    readonly store: CustomerStore,
    readonly session: CustomerSession,
  ) {}
}
