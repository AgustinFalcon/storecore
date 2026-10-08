import { defer, map, Observable, switchMap, tap } from 'rxjs';
import { SessionMutationCancelledError } from '../../session-mutation-cancelled.error';
import { CustomerSessionPort } from '../customer-session.port';
import { CustomerProfile } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

export class ProbeCustomerSessionUseCase {
  constructor(
    private readonly repo: ICustomerRepository,
    private readonly session: CustomerSessionPort,
  ) {}

  execute(): Observable<CustomerProfile> {
    const generation = this.session.generation();
    const assertCurrent = () => { if (this.session.generation() !== generation) throw new SessionMutationCancelledError(); };
    return defer(() => {
      assertCurrent();
      return this.repo.readProfile().pipe(
      tap(() => assertCurrent()),
      switchMap((profile) => this.repo.readCsrf().pipe(map(() => profile))),
      tap(() => { assertCurrent(); this.session.markAuthenticated(); }),
    );
    });
  }
}
