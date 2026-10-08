import { Observable, tap } from 'rxjs';
import { CustomerSessionPort } from '../customer-session.port';
import { CustomerRegistration, CustomerSessionResult } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';
import { SessionMutationCancelledError } from '../../session-mutation-cancelled.error';

export class RegisterCustomerUseCase {
  constructor(
    private readonly repo: ICustomerRepository,
    private readonly session: CustomerSessionPort,
  ) {}

  execute(registration: CustomerRegistration): Observable<CustomerSessionResult> {
    const generation = this.session.generation();
    return this.repo.register(registration).pipe(tap(() => {
      if (this.session.generation() !== generation) throw new SessionMutationCancelledError();
      this.session.markAuthenticated();
    }));
  }
}
