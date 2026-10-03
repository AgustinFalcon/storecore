import { Observable } from 'rxjs';
import { ICustomerRepository } from '../customer.repository';

export class DeleteCustomerAddressUseCase {
  constructor(private readonly repo: ICustomerRepository) {}

  execute(addressId: string): Observable<void> {
    return this.repo.deleteAddress(addressId);
  }
}
