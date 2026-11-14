import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, Observable, Subject } from 'rxjs';
import { AccessContext } from '../../domain/access/access-context';
import { AccessState, SessionProbe } from '../../domain/access/session-probe';
import { UserRole } from '../../domain/user/user-role';
import { AccessCoordinator } from './access-coordinator';
import { UserSession } from './user-session';
import { adminGuard } from './admin.guard';
describe('ADMIN appearance route', () => {
  for (const role of [UserRole.Admin, UserRole.Operator]) {
    it('waits for accepted rehydration before checking ' + role.label, async () => {
      const navigation = new Subject<AccessState>(), session = new UserSession();
      TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: UserSession, useValue: session }, { provide: AccessCoordinator, useValue: { navigationState: () => navigation } }] });
      const result = firstValueFrom(TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never)) as Observable<unknown>);
      session.commit({ id: 'actor', roles: [role] }, 'csrf');
      const authenticated = SessionProbe.authenticated({ id: 'actor', roles: [role] }, 'csrf');
      navigation.next(AccessState.resolve(SessionProbe.Anonymous, authenticated, AccessContext.Unknown));
      expect(role === UserRole.Admin ? await result : String(await result)).toBe(role === UserRole.Admin ? true : '/user/home');
    });
  }
});
