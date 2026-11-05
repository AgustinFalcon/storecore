import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { UserSession } from '../../core/auth/user-session';
import { UserMercadoLibreStore } from './user-mercadolibre.store';
import { UserMercadoLibreViewComponent } from './user-mercadolibre.view';

@Component({
  selector: 'sc-user-mercadolibre',
  imports: [AsyncPipe, UserMercadoLibreViewComponent],
  providers: [UserMercadoLibreStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.vm$ | async; as state) {
      <sc-user-mercadolibre-view
        [state]="state"
        (refresh)="store.loadMercadoLibre()"
        (queryChange)="store.setQuery($event)"
        (clearQuery)="store.clearQuery()"
      />
    }
  `,
})
export class UserMercadoLibreComponent {
  constructor(readonly store: UserMercadoLibreStore, session: UserSession) {
    effect(() => {
      const actorChanged = store.setActor(session.authenticated() ? session.principal() : null);
      if (actorChanged) store.loadMercadoLibre();
    });
  }
}
