import { AsyncPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InventoryAdjustmentComponent } from './inventory-adjustment.component';
import { InventoryAdjustmentStore } from './inventory-adjustment.store';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { UserSession } from '../../core/auth/user-session';
import { UserInventoryStore } from './user-inventory.store';
import { UserInventoryViewComponent } from './user-inventory.view';

@Component({
  selector: 'sc-user-inventory',
  imports: [AsyncPipe, UserInventoryViewComponent, InventoryAdjustmentComponent],
  providers: [UserInventoryStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.vm$ | async; as state) { @if (adjustments.vm$ | async; as adjustment) {
      <sc-user-inventory-view [state]="state"
        [adjustmentAvailable]="adjustment.canWrite" [adjustmentPending]="adjustment.pending" (adjust)="adjustments.open($event, state.readState.isReady)"
        (pageChange)="store.goToPage($event)" (retry)="store.loadInventory()" (queryChange)="store.setQuery($event)"
        (filterChange)="store.setFilter($event)" (clearFilters)="store.clearFilters()" />
    } <sc-inventory-adjustment [rows]="state.rows" [fresh]="state.readState.isReady" (refresh)="store.loadInventory()" /> }
  `,
})
export class UserInventoryComponent {
  constructor(readonly store: UserInventoryStore, session: UserSession, readonly adjustments: InventoryAdjustmentStore) {
    adjustments.applied$.pipe(takeUntilDestroyed()).subscribe(() => store.loadInventory());
    effect(() => {
      const actorChanged = store.setActor(session.authenticated() ? session.principal() : null, session.authenticationEpoch());
      if (actorChanged) store.loadInventory();
    });
  }
}
