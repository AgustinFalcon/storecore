import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { UserOffersStore } from './user-offers.store';
import { UserOffersViewComponent } from './user-offers.view';

@Component({
  selector: 'sc-user-offers',
  imports: [AsyncPipe, UserOffersViewComponent],
  providers: [UserOffersStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-user-offers-view
        [state]="state"
        (draftChange)="store.setDraft($event)"
        (save)="store.persistOffer()"
        (retry)="store.loadOffers()"
      />
    }
  `,
})
export class UserOffersComponent implements OnInit {
  constructor(readonly store: UserOffersStore) {}

  ngOnInit(): void {
    this.store.loadOffers();
  }
}
