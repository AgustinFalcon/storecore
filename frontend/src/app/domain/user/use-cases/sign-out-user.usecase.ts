import { catchError, Observable, switchMap, tap, throwError } from 'rxjs';
import { UserSessionPort } from '../user-session.port';
import { IUserRepository } from '../user.repository';

export class SignOutUserUseCase {
  constructor(
    private readonly repo: IUserRepository,
    private readonly session: UserSessionPort,
  ) {}

  execute(): Observable<void> {
    return this.repo.readCsrf().pipe(
      switchMap(() => this.repo.logout()),
      tap(() => this.session.clear()),
      catchError((err: unknown) => {
        this.session.clear();
        return throwError(() => err);
      }),
    );
  }
}
