import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { InstallationStore } from './installation.store';
import { UserMercadoLibreViewComponent } from './user-mercadolibre.view';

@Component({
  selector: 'sc-user-mercadolibre',
  imports: [AsyncPipe, UserMercadoLibreViewComponent],
  providers: [InstallationStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-user-mercadolibre-view
        [state]="state"
        (draftChange)="store.setListingDraft($event)"
        (save)="store.persistListing()"
      />
    }
  `,
})
export class UserMercadoLibreComponent implements OnInit {
  constructor(readonly store: InstallationStore) {}

  ngOnInit(): void {
    this.store.loadMercadoLibre();
  }
}
