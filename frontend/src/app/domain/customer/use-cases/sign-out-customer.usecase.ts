import { catchError, Observable, switchMap, tap, throwError } from 'rxjs';
import { CustomerSessionPort } from '../customer-session.port';
import { ICustomerRepository } from '../customer.repository';
import { SessionMutationCancelledError } from '../../session-mutation-cancelled.error';

export class SignOutCustomerUseCase {
  constructor(
    private readonly repo: ICustomerRepository,
    private readonly session: CustomerSessionPort,
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
