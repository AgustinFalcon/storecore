import { Inject, Injectable } from '@angular/core';
import { map, Observable, switchMap, tap } from 'rxjs';
import { UserSession } from '../../../core/auth/user-session';
import { USER_REPOSITORY } from '../../../core/tokens/user.tokens';
import { UserSessionResult } from '../user.entity';
import { IUserRepository } from '../user.repository';
import { UserRole } from '../user-role';

@Injectable()
export class ProbeUserSessionUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    private readonly session: UserSession,
  ) {}

  execute(): Observable<UserSessionResult> {
    return this.repo.readMe().pipe(
      tap((profile) => {
        if (!UserRole.hasKnownRole(profile.roles)) {
          this.session.clear();
          throw new Error('Sesión interna sin rol reconocido.');
        }
      }),
      switchMap((profile) => this.repo.readCsrf().pipe(map(() => profile))),
      tap(() => this.session.markAuthenticated()),
    );
  }
}
