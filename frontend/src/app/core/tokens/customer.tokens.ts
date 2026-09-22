import { InjectionToken } from '@angular/core';
import { ICustomerRepository } from '../../domain/customer/customer.repository';

export const CUSTOMER_REPOSITORY = new InjectionToken<ICustomerRepository>('ICustomerRepository');
