import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { AccessCoordinator } from './access-coordinator';

export const userGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const destination = ReturnDestination.fromPath(state.url);
  return inject(AccessCoordinator).rehydrate().pipe(map((access) => access.activeContext === AccessContext.User && access.permits(AccessContext.User) ? true
    : router.createUrlTree(['/login'], { queryParams: { returnTo: destination === ReturnDestination.Unknown ? ReturnDestination.Home.wire : destination.wire } })));
};
