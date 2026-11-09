import { AdminCustomer, CustomerStateTransition } from '../customer-admin';
import { ICustomerAdminRepository } from '../customer-admin.repository';
export class TransitionCustomerUseCase { constructor(private readonly repository: ICustomerAdminRepository) {} execute(customer: AdminCustomer, transition: CustomerStateTransition) { return this.repository.transition(customer, transition); } }
