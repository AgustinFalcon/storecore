import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
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
  readonly logoutBusy = signal(false);
  readonly logoutMessage = signal('');
  constructor(
    readonly session: CustomerSession,
    private readonly access: AccessCoordinator,
    private readonly router: Router,
  ) {}

  signOut(): void {
    if (this.logoutBusy()) return;
    this.logoutBusy.set(true);
    this.logoutMessage.set('');
    this.access.logout(AccessContext.Customer).subscribe({
      next: () => { this.logoutBusy.set(false); void this.router.navigateByUrl('/login'); },
      error: () => { this.logoutBusy.set(false); this.logoutMessage.set('No se pudo cerrar la sesión. Intentá nuevamente.'); },
    });
  }
}
