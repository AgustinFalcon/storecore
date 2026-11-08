import { InjectionToken } from '@angular/core';
import { ICustomerAdminRepository } from '../../domain/customer-admin/customer-admin.repository';
export const CUSTOMER_ADMIN_REPOSITORY = new InjectionToken<ICustomerAdminRepository>('CUSTOMER_ADMIN_REPOSITORY');
