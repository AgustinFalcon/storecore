import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UserSession } from '../../core/auth/user-session';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessContext } from '../../domain/access/access-context';
import { UserAction } from './user-action';

@Component({
  selector: 'sc-user-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-layout.component.html',
})
export class UserLayoutComponent {
  readonly actions = computed(() => this.session.authenticated() ? UserAction.forRoles(this.session.roles()) : []);
  readonly logoutBusy = signal(false);
  readonly logoutMessage = signal('');
  constructor(
    readonly session: UserSession,
    private readonly access: AccessCoordinator,
    private readonly router: Router,
  ) {}

  signOut(): void {
    if (this.logoutBusy()) return;
    this.logoutBusy.set(true);
    this.logoutMessage.set('');
    this.access.logout(AccessContext.User).subscribe({
      next: () => { this.logoutBusy.set(false); void this.router.navigateByUrl('/login'); },
      error: () => { this.logoutBusy.set(false); this.logoutMessage.set('No se pudo cerrar la sesión. Intentá nuevamente.'); },
    });
  }
}
