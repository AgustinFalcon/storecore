import { catchError, Observable, switchMap, tap, throwError } from 'rxjs';
import { CustomerSessionPort } from '../customer-session.port';
import { ICustomerRepository } from '../customer.repository';

export class SignOutCustomerUseCase {
  constructor(
    private readonly repo: ICustomerRepository,
    private readonly session: CustomerSessionPort,
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
