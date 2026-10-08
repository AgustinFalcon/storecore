import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CustomerSession } from '../../core/auth/customer-session';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessContext } from '../../domain/access/access-context';


@Component({
  selector: 'sc-customer-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-layout.component.html',
})
export class CustomerLayoutComponent {
  readonly actions = AccessContext;
  errorMessage = '';
  constructor(
    readonly session: CustomerSession,
    private readonly access: AccessCoordinator,
    private readonly router: Router,
  ) {}

  signOut(): void {
    this.access.logout(AccessContext.Customer).subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: () => { this.errorMessage = 'No se pudo cerrar la sesión. Reintentá salir.'; },
    });
  }
}
