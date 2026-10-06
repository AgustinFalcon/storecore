import { Observable, tap } from 'rxjs';
import { UserSessionPort } from '../user-session.port';
import { UserCredentials, UserSessionResult } from '../user.entity';
import { IUserRepository } from '../user.repository';
import { UserRole } from '../user-role';

export class SignInUserUseCase {
  constructor(
    private readonly repo: IUserRepository,
    private readonly session: UserSessionPort,
  ) {}

  execute(credentials: UserCredentials): Observable<UserSessionResult> {
    return this.repo.signIn(credentials).pipe(tap((profile) => {
      if (!UserRole.hasKnownRole(profile.roles)) {
        this.session.clear();
        throw new Error('Sesión interna sin rol reconocido.');
      }
      this.session.markAuthenticated(profile);
    }));
  }
}
