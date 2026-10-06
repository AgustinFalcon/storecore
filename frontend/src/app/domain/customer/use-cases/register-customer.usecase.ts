import { Observable, tap } from 'rxjs';
import { CustomerSessionPort } from '../customer-session.port';
import { CustomerRegistration, CustomerSessionResult } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

export class RegisterCustomerUseCase {
  constructor(
    private readonly repo: ICustomerRepository,
    private readonly session: CustomerSessionPort,
  ) {}

  execute(registration: CustomerRegistration): Observable<CustomerSessionResult> {
    return this.repo.register(registration).pipe(tap((principal) => this.session.markAuthenticated(principal)));
  }
}
