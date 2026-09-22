import { Inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { CustomerSession } from '../../../core/auth/customer-session';
import { CUSTOMER_REPOSITORY } from '../../../core/tokens/customer.tokens';
import { CustomerCredentials, CustomerSessionResult } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

@Injectable()
export class SignInCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly repo: ICustomerRepository,
    private readonly session: CustomerSession,
  ) {}

  execute(credentials: CustomerCredentials): Observable<CustomerSessionResult> {
    return this.repo.signIn(credentials).pipe(tap(() => this.session.markAuthenticated()));
  }
}
