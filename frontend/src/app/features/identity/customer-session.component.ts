import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CustomerSession } from '../../core/auth/customer-session';
import { CustomerSessionViewComponent } from './customer-session.view';
import { CustomerStore } from './customer.store';

@Component({
  selector: 'sc-customer-session',
  imports: [AsyncPipe, CustomerSessionViewComponent],
  providers: [CustomerStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-customer-session-view
        [state]="state"
        [authenticated]="session.authenticated()"
        (emailChange)="store.setEmail($event)"
        (passwordChange)="store.setPassword($event)"
        (submitSignIn)="store.submitSignIn()"
        (signOut)="store.signOut()"
      />
    }
  `,
})
export class CustomerSessionComponent {
  constructor(
    readonly store: CustomerStore,
    readonly session: CustomerSession,
  ) {}
}
