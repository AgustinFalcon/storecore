import { Inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { UserSession } from '../../../core/auth/user-session';
import { USER_REPOSITORY } from '../../../core/tokens/user.tokens';
import { UserCredentials, UserSessionResult } from '../user.entity';
import { IUserRepository } from '../user.repository';

@Injectable()
export class SignInUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    private readonly session: UserSession,
  ) {}

  execute(credentials: UserCredentials): Observable<UserSessionResult> {
    return this.repo.signIn(credentials).pipe(tap(() => this.session.markAuthenticated()));
  }
}
