import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { AccessCoordinator } from './access-coordinator';
import { UserAction } from '../../domain/user/user-action';
import { UserSession } from './user-session';

export const userGuard: CanActivateFn = (route, state) => {
  const coordinator = inject(AccessCoordinator);
  const router = inject(Router);
  const destination = ReturnDestination.fromPath(state.url);
  const login = router.createUrlTree(['/login'], { queryParams: { returnTo: destination === ReturnDestination.Unknown ? ReturnDestination.Home.wire : destination.wire } });
  const session = inject(UserSession);
  const action = route.data['action'] as UserAction | undefined;
  return coordinator.rehydrate().pipe(map(access => {
    if (!access.permits(AccessContext.User)) return login;
    if (access.activeContext !== AccessContext.User) return login;
    if (action && !action.permits(session.roles())) return router.parseUrl('/user/home');
    return true;
  }), catchError(() => of(login)));
};
