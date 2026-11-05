import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { UserSession } from '../../core/auth/user-session';
import { UserInventoryStore } from './user-inventory.store';
import { UserInventoryViewComponent } from './user-inventory.view';

@Component({
  selector: 'sc-user-inventory',
  imports: [AsyncPipe, UserInventoryViewComponent],
  providers: [UserInventoryStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.vm$ | async; as state) {
      <sc-user-inventory-view [state]="state"
        (retry)="store.loadInventory()" (queryChange)="store.setQuery($event)"
        (filterChange)="store.setFilter($event)" (clearFilters)="store.clearFilters()" />
    }
  `,
})
export class UserInventoryComponent {
  constructor(readonly store: UserInventoryStore, session: UserSession) {
    effect(() => {
      const actorChanged = store.setActor(session.authenticated() ? session.principal() : null);
      if (actorChanged) store.loadInventory();
    });
  }
}
