import { Observable } from 'rxjs';
import { CustomerAddress, CustomerCredentials, CustomerProfile, CustomerRegistration, CustomerSessionResult } from './customer.entity';

export interface ICustomerRepository {
  register(registration: CustomerRegistration): Observable<CustomerSessionResult>;
  signIn(credentials: CustomerCredentials): Observable<CustomerSessionResult>;
  logout(): Observable<void>;
  readCsrf(): Observable<void>;
  readProfile(): Observable<CustomerProfile>;
  saveProfile(profile: CustomerProfile): Observable<CustomerProfile>;
  listAddresses(): Observable<readonly CustomerAddress[]>;
  saveAddress(address: CustomerAddress): Observable<CustomerAddress>;
  deleteAddress(addressId: string): Observable<void>;
}
