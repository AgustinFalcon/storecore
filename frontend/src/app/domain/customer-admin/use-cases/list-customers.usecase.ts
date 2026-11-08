import { CustomerQuery } from '../customer-admin';
import { ICustomerAdminRepository } from '../customer-admin.repository';
export class ListCustomersUseCase { constructor(private readonly repository: ICustomerAdminRepository) {} execute(query: CustomerQuery) { return this.repository.list(query); } }
