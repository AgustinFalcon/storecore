import { map, Observable, switchMap, tap } from 'rxjs';
import { UserSessionPort } from '../user-session.port';
import { UserSessionResult } from '../user.entity';
import { IUserRepository } from '../user.repository';
import { UserRole } from '../user-role';

export class ProbeUserSessionUseCase {
  constructor(
    private readonly repo: IUserRepository,
    private readonly session: UserSessionPort,
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
