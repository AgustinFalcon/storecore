import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';
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
      [canWrite]="(canWrite$ | async) ?? false"
      [busy]="(store.changingCapability$ | async) ?? false"
      (changeState)="store.changeCapability($event)"
      (retry)="store.loadCapabilities()"
    />
  `,
})
export class UserCapabilitiesComponent implements OnInit {
  readonly canWrite$;
  constructor(readonly store: InstallationStore, ops: ManageInstallationUseCase) {
    this.canWrite$ = ops.canChangeCapabilities();
  }

  ngOnInit(): void {
    this.store.loadCapabilities();
  }
}
