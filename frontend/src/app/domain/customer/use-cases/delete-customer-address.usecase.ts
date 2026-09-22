import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CUSTOMER_REPOSITORY } from '../../../core/tokens/customer.tokens';
import { ICustomerRepository } from '../customer.repository';

@Injectable()
export class DeleteCustomerAddressUseCase {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly repo: ICustomerRepository) {}

  execute(addressId: string): Observable<void> {
    return this.repo.deleteAddress(addressId);
  }
}
