import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { CustomerAddress, CustomerCredentials, CustomerProfile, CustomerRegistration, CustomerSessionResult } from '../../domain/customer/customer.entity';
import { ICustomerRepository } from '../../domain/customer/customer.repository';
import { mapAddress, mapAddresses, mapCustomerSession, mapProfile } from '../mappers/http-mappers';

@Injectable()
export class CustomerHttpRepository implements ICustomerRepository {
  constructor(private readonly http: HttpClient) {}

  register(registration: CustomerRegistration): Observable<CustomerSessionResult> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/customer/auth/register`, registration)
      .pipe(map((body) => mapCustomerSession(readApiBody<unknown>(body))));
  }

  signIn(credentials: CustomerCredentials): Observable<CustomerSessionResult> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/customer/auth/login`, credentials)
      .pipe(map((body) => mapCustomerSession(readApiBody<unknown>(body))));
  }

  logout(): Observable<void> {
    return this.http.post(`${environment.apiBaseUrl}/customer/auth/logout`, {}, { observe: 'response' }).pipe(map(() => undefined));
  }

  readCsrf(): Observable<void> {
    return this.http.get(`${environment.apiBaseUrl}/customer/auth/csrf`, { observe: 'response' }).pipe(map(() => undefined));
  }

  readProfile(): Observable<CustomerProfile> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/customer/me`)
      .pipe(map((body) => mapProfile(readApiBody<unknown>(body))));
  }

  saveProfile(profile: CustomerProfile): Observable<CustomerProfile> {
    return this.http
      .put<unknown>(`${environment.apiBaseUrl}/customer/me`, profile)
      .pipe(map((body) => mapProfile(readApiBody<unknown>(body))));
  }

  listAddresses(): Observable<readonly CustomerAddress[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/customer/me/addresses`)
      .pipe(map((body) => mapAddresses(readApiBody<unknown>(body))));
  }

  saveAddress(address: CustomerAddress): Observable<CustomerAddress> {
    const path = address.id
      ? `${environment.apiBaseUrl}/customer/me/addresses/${address.id}`
      : `${environment.apiBaseUrl}/customer/me/addresses`;
    const payload = {
      street: address.street,
      number: address.number,
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      isDefault: address.isDefault,
    };
    const request = address.id ? this.http.put<unknown>(path, payload) : this.http.post<unknown>(path, payload);
    return request.pipe(map((body) => mapAddress(readApiBody<unknown>(body))));
  }

  deleteAddress(addressId: string): Observable<void> {
    return this.http
      .delete(`${environment.apiBaseUrl}/customer/me/addresses/${addressId}`, { observe: 'response' })
      .pipe(map(() => undefined));
  }
}
