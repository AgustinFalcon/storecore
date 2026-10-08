import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UserSession } from '../../core/auth/user-session';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessContext } from '../../domain/access/access-context';
import { UserAction } from '../../domain/user/user-action';

@Component({
  selector: 'sc-user-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-layout.component.html',
})
export class UserLayoutComponent {
  readonly actions = computed(() => this.session.authenticated() ? UserAction.forRoles(this.session.roles()) : []);
  errorMessage = '';
  constructor(
    readonly session: UserSession,
    private readonly access: AccessCoordinator,
    private readonly router: Router,
  ) {}

  signOut(): void {
    this.access.logout(AccessContext.User).subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: () => { this.errorMessage = 'No se pudo cerrar la sesión. Reintentá salir.'; },
    });
  }
}
