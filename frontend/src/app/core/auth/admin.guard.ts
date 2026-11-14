import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { UserSession } from './user-session';
import { UserRole } from '../../domain/user/user-role';
import { AccessCoordinator } from './access-coordinator';
import { AccessContext } from '../../domain/access/access-context';
export const adminGuard: CanActivateFn = () => {
  const session = inject(UserSession), router = inject(Router);
  return inject(AccessCoordinator).navigationState().pipe(map(access =>
    access.activeContext === AccessContext.User && access.permits(AccessContext.User) && session.authenticated() && session.roles().includes(UserRole.Admin)
      ? true : router.createUrlTree(['/user/home'])));
};
