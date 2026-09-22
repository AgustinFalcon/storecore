import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UserSession } from '../../core/auth/user-session';
import { UserSessionViewComponent } from './user-session.view';
import { UserStore } from './user.store';

@Component({
  selector: 'sc-user-session',
  imports: [AsyncPipe, UserSessionViewComponent],
  providers: [UserStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-user-session-view
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
export class UserSessionComponent {
  constructor(
    readonly store: UserStore,
    readonly session: UserSession,
  ) {}
}
