import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { InstallationStore } from './installation.store';
import { UserInventoryViewComponent } from './user-inventory.view';

@Component({
  selector: 'sc-user-inventory',
  imports: [AsyncPipe, UserInventoryViewComponent],
  providers: [InstallationStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-user-inventory-view
      [rows]="(store.inventory$ | async) ?? []"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) ?? ''"
      (retry)="store.loadInventory()"
    />
  `,
})
export class UserInventoryComponent implements OnInit {
  constructor(readonly store: InstallationStore) {}

  ngOnInit(): void {
    this.store.loadInventory();
  }
}
