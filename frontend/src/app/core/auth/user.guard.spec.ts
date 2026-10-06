import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, Observable, of } from 'rxjs';
import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { AccessState, SessionProbe } from '../../domain/access/session-probe';
import { UserRole } from '../../domain/user/user-role';
import { AccessCoordinator } from './access-coordinator';
import { userGuard } from './user.guard';

describe('userGuard', () => {
  function run(access: AccessState, url: string): Promise<unknown> {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AccessCoordinator, useValue: { rehydrate: () => of(access) } }] });
    return firstValueFrom(TestBed.runInInjectionContext(() => userGuard({} as never, { url } as never)) as Observable<unknown>);
  }
  it('redirects to unified login with a closed return destination', async () => {
    expect(String(await run(AccessState.Anonymous, '/user/orders'))).toBe('/login?returnTo=' + ReturnDestination.UserOrders.wire);
  });
  it('does not replay arbitrary protected URLs', async () => {
    expect(String(await run(AccessState.Indeterminate, '/user/details/secret?context=USER'))).toBe('/login?returnTo=' + ReturnDestination.Home.wire);
  });
  it('allows only accepted realm authority', async () => {
    const authenticated = SessionProbe.authenticated({ id: '1', roles: [UserRole.Operator] }, 'csrf');
    expect(await run(AccessState.resolve(SessionProbe.Anonymous, authenticated, AccessContext.Unknown), '/user/orders')).toBe(true);
  });
  it('requires explicit choice when both realm sessions are valid without a hint', async () => {
    const authenticated = SessionProbe.authenticated({ id: '1', roles: [UserRole.Operator] }, 'csrf');
    expect(String(await run(AccessState.resolve(authenticated, authenticated, AccessContext.Unknown), '/user/orders')))
      .toBe('/login?returnTo=' + ReturnDestination.UserOrders.wire);
  });
});
