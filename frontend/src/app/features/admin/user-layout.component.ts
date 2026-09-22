import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UserSession } from '../../core/auth/user-session';
import { SignOutUserUseCase } from '../../domain/user/use-cases/sign-out-user.usecase';

@Component({
  selector: 'sc-user-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-layout.component.html',
})
export class UserLayoutComponent {
  constructor(
    readonly session: UserSession,
    private readonly signOutUser: SignOutUserUseCase,
    private readonly router: Router,
  ) {}

  signOut(): void {
    this.signOutUser.execute().subscribe({
      next: () => void this.router.navigateByUrl('/user/session'),
      error: () => void this.router.navigateByUrl('/user/session'),
    });
  }
}
