import { Inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { CustomerSession } from '../../../core/auth/customer-session';
import { CUSTOMER_REPOSITORY } from '../../../core/tokens/customer.tokens';
import { CustomerRegistration, CustomerSessionResult } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

@Injectable()
export class RegisterCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly repo: ICustomerRepository,
    private readonly session: CustomerSession,
  ) {}

  execute(registration: CustomerRegistration): Observable<CustomerSessionResult> {
    return this.repo.register(registration).pipe(tap(() => this.session.markAuthenticated()));
  }
}
