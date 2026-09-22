import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CUSTOMER_REPOSITORY } from '../../../core/tokens/customer.tokens';
import { CustomerProfile } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

@Injectable()
export class SaveCustomerProfileUseCase {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly repo: ICustomerRepository) {}

  execute(profile: CustomerProfile): Observable<CustomerProfile> {
    return this.repo.saveProfile(profile);
  }
}
