import { Inject, Injectable } from '@angular/core';
import { catchError, Observable, switchMap, tap, throwError } from 'rxjs';
import { UserSession } from '../../../core/auth/user-session';
import { USER_REPOSITORY } from '../../../core/tokens/user.tokens';
import { IUserRepository } from '../user.repository';

@Injectable()
export class SignOutUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    private readonly session: UserSession,
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
