import { Inject, Injectable } from '@angular/core';
import { map, Observable, switchMap, tap } from 'rxjs';
import { CustomerSession } from '../../../core/auth/customer-session';
import { CUSTOMER_REPOSITORY } from '../../../core/tokens/customer.tokens';
import { CustomerProfile } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

@Injectable()
export class ProbeCustomerSessionUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly repo: ICustomerRepository,
    private readonly session: CustomerSession,
  ) {}

  execute(): Observable<CustomerProfile> {
    return this.repo.readProfile().pipe(
      switchMap((profile) => this.repo.readCsrf().pipe(map(() => profile))),
      tap(() => this.session.markAuthenticated()),
    );
  }
}
