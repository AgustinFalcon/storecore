import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { AccessCoordinator } from './access-coordinator';

export const customerGuard: CanActivateFn = (route, state) => {
  const coordinator = inject(AccessCoordinator);
  const router = inject(Router);
  const destination = ReturnDestination.fromPath(state.url);
  const login = router.createUrlTree(['/login'], { queryParams: { returnTo: destination === ReturnDestination.Unknown ? ReturnDestination.Home.wire : destination.wire } });
  return coordinator.rehydrate().pipe(map(access => {
    if (!access.permits(AccessContext.Customer)) return login;
    if (access.activeContext !== AccessContext.Customer) return login;
    return true;
  }), catchError(() => of(login)));
};
