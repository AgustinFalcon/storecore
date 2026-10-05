import { Inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { UserSession } from '../../../core/auth/user-session';
import { USER_REPOSITORY } from '../../../core/tokens/user.tokens';
import { UserCredentials, UserSessionResult } from '../user.entity';
import { IUserRepository } from '../user.repository';
import { UserRole } from '../user-role';

@Injectable()
export class SignInUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    private readonly session: UserSession,
  ) {}

  execute(credentials: UserCredentials): Observable<UserSessionResult> {
    return this.repo.signIn(credentials).pipe(tap((profile) => {
      if (!UserRole.hasKnownRole(profile.roles)) {
        this.session.clear();
        throw new Error('Sesión interna sin rol reconocido.');
      }
      this.session.markAuthenticated();
    }));
  }
}
