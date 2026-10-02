import { map, Observable, switchMap, tap } from 'rxjs';
import { UserSessionPort } from '../user-session.port';
import { UserSessionResult } from '../user.entity';
import { IUserRepository } from '../user.repository';

export class ProbeUserSessionUseCase {
  constructor(
    private readonly repo: IUserRepository,
    private readonly session: UserSessionPort,
  ) {}

  execute(): Observable<UserSessionResult> {
    return this.repo.readMe().pipe(
      switchMap((profile) => this.repo.readCsrf().pipe(map(() => profile))),
      tap(() => this.session.markAuthenticated()),
    );
  }
}
