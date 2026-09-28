import { InjectionToken } from '@angular/core';
import { IBillingRepository } from '../../domain/billing/billing.repository';

export const BILLING_REPOSITORY = new InjectionToken<IBillingRepository>('IBillingRepository');
