import { Observable } from 'rxjs';
import { CustomerProfile } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

export class SaveCustomerProfileUseCase {
  constructor(private readonly repo: ICustomerRepository) {}

  execute(profile: CustomerProfile): Observable<CustomerProfile> {
    return this.repo.saveProfile(profile);
  }
}
