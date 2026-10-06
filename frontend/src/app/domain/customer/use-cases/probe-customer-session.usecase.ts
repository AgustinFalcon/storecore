import { map, Observable, switchMap, tap } from 'rxjs';
import { CustomerSessionPort } from '../customer-session.port';
import { CustomerProfile } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

export class ProbeCustomerSessionUseCase {
  constructor(
    private readonly repo: ICustomerRepository,
    private readonly session: CustomerSessionPort,
  ) {}

  execute(): Observable<CustomerProfile> {
    return this.repo.readProfile().pipe(
      switchMap((profile) => this.repo.readCsrf().pipe(map(() => profile))),
      tap((profile) => this.session.markAuthenticated(profile)),
    );
  }
}
