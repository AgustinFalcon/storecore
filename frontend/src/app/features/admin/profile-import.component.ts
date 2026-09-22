import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ProfileImportViewComponent } from './profile-import.view';
import { UserStore } from './user.store';

@Component({
  selector: 'sc-profile-import',
  imports: [AsyncPipe, ProfileImportViewComponent],
  providers: [UserStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-profile-import-view
        [state]="state"
        (manifestChange)="store.setManifest($event)"
        (preview)="store.previewProfile()"
        (merge)="store.mergeProfile()"
      />
    }
  `,
})
export class ProfileImportComponent {
  constructor(readonly store: UserStore) {}
}
