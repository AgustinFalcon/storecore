import { Observable } from 'rxjs';
import { CustomerAddress } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

export class ListCustomerAddressesUseCase {
  constructor(private readonly repo: ICustomerRepository) {}

  execute(): Observable<readonly CustomerAddress[]> {
    return this.repo.listAddresses();
  }
}
