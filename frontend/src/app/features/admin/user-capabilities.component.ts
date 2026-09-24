import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { InstallationStore } from './installation.store';
import { UserCapabilitiesViewComponent } from './user-capabilities.view';

@Component({
  selector: 'sc-user-capabilities',
  imports: [AsyncPipe, UserCapabilitiesViewComponent],
  providers: [InstallationStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-user-capabilities-view
      [items]="(store.capabilities$ | async) ?? []"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) ?? ''"
      (changeState)="store.changeCapability($event)"
      (retry)="store.loadCapabilities()"
    />
  `,
})
export class UserCapabilitiesComponent implements OnInit {
  constructor(readonly store: InstallationStore) {}

  ngOnInit(): void {
    this.store.loadCapabilities();
  }
}
