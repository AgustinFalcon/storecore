import { catchError, Observable, switchMap, tap, throwError } from 'rxjs';
import { UserSessionPort } from '../user-session.port';
import { IUserRepository } from '../user.repository';
import { SessionMutationCancelledError } from '../../session-mutation-cancelled.error';

export class SignOutUserUseCase {
  constructor(
    private readonly repo: IUserRepository,
    private readonly session: UserSessionPort,
  ) {}

  execute(): Observable<void> {
    const generation = this.session.generation();
    const clearIfCurrent = (): void => {
      if (this.session.generation() === generation) this.session.clear();
    };
    return this.repo.readCsrf().pipe(
      switchMap(() => this.session.generation() === generation
        ? this.repo.logout()
        : throwError(() => new SessionMutationCancelledError())),
      tap(() => clearIfCurrent()),
      catchError((err: unknown) => {
        clearIfCurrent();
        return throwError(() => err);
      }),
    );
  }
}
