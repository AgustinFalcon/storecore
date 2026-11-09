import { Observable } from 'rxjs';
import { AdminCustomer, CustomerPage, CustomerQuery, CustomerStateTransition } from './customer-admin';
export interface ICustomerAdminRepository {
  list(query: CustomerQuery): Observable<CustomerPage>;
  get(id: number): Observable<AdminCustomer>;
  transition(customer: AdminCustomer, transition: CustomerStateTransition): Observable<AdminCustomer>;
}
