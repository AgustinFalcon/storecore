import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { UserContentViewComponent } from './user-content.view';
import { UserStore } from './user.store';

@Component({
  selector: 'sc-user-content',
  imports: [AsyncPipe, UserContentViewComponent],
  providers: [UserStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-user-content-view [state]="state" (homeChange)="store.setHome($event)" (save)="store.persistHome()" />
    }
  `,
})
export class UserContentComponent implements OnInit {
  constructor(readonly store: UserStore) {}

  ngOnInit(): void {
    this.store.loadHome();
  }
}
