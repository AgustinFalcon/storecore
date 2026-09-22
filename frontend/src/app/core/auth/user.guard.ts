import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ProbeUserSessionUseCase } from '../../domain/user/use-cases/probe-user-session.usecase';
import { UserSession } from './user-session';

export const userGuard: CanActivateFn = () => {
  const session = inject(UserSession);
  const router = inject(Router);
  if (session.authenticated()) {
    return true;
  }
  return inject(ProbeUserSessionUseCase)
    .execute()
    .pipe(
      map(() => true),
      catchError(() => of(router.parseUrl('/user/session'))),
    );
};
