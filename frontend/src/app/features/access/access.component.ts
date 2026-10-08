import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AccessStore } from './access.store';
import { AccessViewComponent } from './access.view';

@Component({
  selector: 'sc-access',
  imports: [AsyncPipe, AccessViewComponent],
  providers: [AccessStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (store.state$ | async; as state) {
    <sc-access-view [state]="state" (emailChange)="store.setEmail($event)" (passwordChange)="store.setPassword($event)"
      (submitCredentials)="store.submit()" (selectContext)="store.selectContext($event)" (restart)="store.restart()" />
  }`,
})
export class AccessComponent {
  constructor(readonly store: AccessStore, route: ActivatedRoute) {
    store.setReturnPath(route.snapshot.queryParamMap.get('returnPath'));
  }
}
