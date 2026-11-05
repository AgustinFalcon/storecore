import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { UserSession } from '../../core/auth/user-session';
import { UserCapabilitiesStore } from './user-capabilities.store';
import { UserCapabilitiesViewComponent } from './user-capabilities.view';

@Component({
  selector: 'sc-user-capabilities',
  imports: [AsyncPipe, UserCapabilitiesViewComponent],
  providers: [UserCapabilitiesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.vm$ | async; as state) {
      <sc-user-capabilities-view [state]="state"
        (refresh)="store.loadCapabilities()" (queryChange)="store.setQuery($event)"
        (filterChange)="store.setFilter($event)" (clearFilters)="store.clearFilters()" />
    }
  `,
})
export class UserCapabilitiesComponent {
  constructor(readonly store: UserCapabilitiesStore, session: UserSession) {
    effect(() => {
      const actorChanged = store.setActor(session.authenticated() ? session.principal() : null);
      if (actorChanged) store.loadCapabilities();
    });
  }
}
