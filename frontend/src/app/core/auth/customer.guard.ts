import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ProbeCustomerSessionUseCase } from '../../domain/customer/use-cases/probe-customer-session.usecase';
import { CustomerSession } from './customer-session';

export const customerGuard: CanActivateFn = () => {
  const session = inject(CustomerSession);
  const router = inject(Router);
  if (session.authenticated()) {
    return true;
  }
  return inject(ProbeCustomerSessionUseCase)
    .execute()
    .pipe(
      map(() => true),
      catchError(() => of(router.parseUrl('/customer/session'))),
    );
};
