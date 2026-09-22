import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CUSTOMER_REPOSITORY } from '../../../core/tokens/customer.tokens';
import { CustomerAddress } from '../customer.entity';
import { ICustomerRepository } from '../customer.repository';

@Injectable()
export class ListCustomerAddressesUseCase {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly repo: ICustomerRepository) {}

  execute(): Observable<readonly CustomerAddress[]> {
    return this.repo.listAddresses();
  }
}
