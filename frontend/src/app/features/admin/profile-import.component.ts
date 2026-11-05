import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ProfileImportViewComponent } from './profile-import.view';
import { ProfileImportStore } from './profile-import.store';

@Component({
  selector: 'sc-profile-import',
  imports: [AsyncPipe, ProfileImportViewComponent],
  providers: [ProfileImportStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-profile-import-view
        [state]="state"
        (manifestChange)="store.setManifest($event)"
        (preview)="store.previewProfile()"
        (reviewUncertain)="store.reviewUncertainResult()"
        (selectionChange)="store.selectSection($event.key, $event.selected)"
        (confirm)="store.requestConfirmation()"
        (cancelConfirmation)="store.cancelConfirmation()"
        (merge)="store.mergeProfile()"
      />
    }
  `,
})
export class ProfileImportComponent {
  constructor(readonly store: ProfileImportStore) {}
}
