import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, effect, inject, input } from '@angular/core';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { RecoveryRealm } from '../../domain/access/recovery';
import { EmailOwnershipStore } from './email-ownership.store';
import { EmailOwnershipViewComponent } from './email-ownership.view';

@Component({ selector: 'sc-email-ownership', imports: [AsyncPipe, EmailOwnershipViewComponent], providers: [EmailOwnershipStore], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (store.state$ | async; as state) { <sc-email-ownership-view [state]="state" (request)="store.request()" (refresh)="store.refresh()" /> }` })
export class EmailOwnershipComponent implements OnChanges {
  readonly realm = input.required<RecoveryRealm>();
  /** Changes only after an authoritative profile read/save, never on draft typing. */
  @Input() revision = 0;
  readonly store = inject(EmailOwnershipStore);
  private readonly customer = inject(CustomerSession);
  private readonly user = inject(UserSession);
  constructor() {
    effect(() => {
      const realm = this.realm();
      const actor = realm === RecoveryRealm.Customer ? this.customer.actorIdentity()
        : realm === RecoveryRealm.User && this.user.authenticated() && UserRole.hasKnownRole(this.user.roles()) ? `${this.user.principal()?.id}:${this.user.authenticationEpoch()}` : null;
      this.store.bind(realm, actor);
    });
  }
  ngOnChanges(): void { this.store.refresh(true); }
}
