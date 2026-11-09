import { ICustomerAdminRepository } from '../customer-admin.repository';
export class GetCustomerUseCase { constructor(private readonly repository: ICustomerAdminRepository) {} execute(id: number) { return this.repository.get(id); } }
