import { Observable } from 'rxjs';
import { CustomerProfile } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

export class GetCustomerProfileUseCase {
  constructor(private readonly repo: ICustomerRepository) {}

  execute(): Observable<CustomerProfile> {
    return this.repo.readProfile();
  }
}
