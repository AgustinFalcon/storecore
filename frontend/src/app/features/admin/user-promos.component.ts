import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { UserPromosViewComponent } from './user-promos.view';
import { UserStore } from './user.store';

@Component({
  selector: 'sc-user-promos',
  imports: [AsyncPipe, UserPromosViewComponent],
  providers: [UserStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-user-promos-view
        [state]="state"
        (draftChange)="store.setPromoDraft($event)"
        (save)="store.persistPromo()"
        (retry)="store.loadPromos()"
      />
    }
  `,
})
export class UserPromosComponent implements OnInit {
  constructor(readonly store: UserStore) {}

  ngOnInit(): void {
    this.store.loadPromos();
  }
}
