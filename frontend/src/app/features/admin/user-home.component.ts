import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserSession } from '../../core/auth/user-session';
import { UserAction } from '../../domain/user/user-action';

@Component({
  selector: 'sc-user-home',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="sc-panel" aria-labelledby="operations-title">
    <p class="sc-eyebrow">StoreCore · Operaciones</p><h1 id="operations-title">Inicio de operaciones</h1>
    <p>Elegí una tarea disponible para tu acceso actual.</p>
    <ul>@for (action of actions(); track action) { <li><a [routerLink]="action.path">{{ action.label }}</a></li> }</ul>
    @if (actions().length === 0) { <p role="status">No hay acciones disponibles para este acceso.</p> }
    <a routerLink="/catalog">Ver catálogo de la tienda</a>
  </section>`,
})
export class UserHomeComponent {
  readonly actions = computed(() => this.session.authenticated() ? UserAction.forRoles(this.session.roles()) : []);
  constructor(readonly session: UserSession) {}
}
