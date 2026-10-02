import { Observable } from 'rxjs';
import { CustomerAddress } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

export class SaveCustomerAddressUseCase {
  constructor(private readonly repo: ICustomerRepository) {}

  execute(address: CustomerAddress): Observable<CustomerAddress> {
    return this.repo.saveAddress(address);
  }
}
