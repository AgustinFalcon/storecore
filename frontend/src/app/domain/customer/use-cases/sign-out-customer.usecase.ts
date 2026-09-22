import { Inject, Injectable } from '@angular/core';
import { catchError, Observable, switchMap, tap, throwError } from 'rxjs';
import { CustomerSession } from '../../../core/auth/customer-session';
import { CUSTOMER_REPOSITORY } from '../../../core/tokens/customer.tokens';
import { ICustomerRepository } from '../customer.repository';

@Injectable()
export class SignOutCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly repo: ICustomerRepository,
    private readonly session: CustomerSession,
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
