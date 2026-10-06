import { Observable, tap } from 'rxjs';
import { CustomerSessionPort } from '../customer-session.port';
import { CustomerCredentials, CustomerSessionResult } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

export class SignInCustomerUseCase {
  constructor(
    private readonly repo: ICustomerRepository,
    private readonly session: CustomerSessionPort,
  ) {}

  execute(credentials: CustomerCredentials): Observable<CustomerSessionResult> {
    return this.repo.signIn(credentials).pipe(tap((principal) => this.session.markAuthenticated(principal)));
  }
}
