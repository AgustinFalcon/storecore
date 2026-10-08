import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { AccessContext } from '../../domain/access/access-context';
import { AccessState, SessionProbe } from '../../domain/access/session-probe';
import { UserRole } from '../../domain/user/user-role';
import { AccessCoordinator } from './access-coordinator';
import { customerGuard } from './customer.guard';

describe('customerGuard verified access', () => {
  let state = AccessState.Anonymous;
  const buyer = SessionProbe.authenticated({ id: 'buyer', email: 'buyer@test', firstName: '', lastName: '', phone: '' }, 'csrf');
  const operator = SessionProbe.authenticated({ id: 'operator', roles: [UserRole.Operator] }, 'csrf');
  beforeEach(() => {
    state = AccessState.Anonymous;
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AccessCoordinator, useValue: { rehydrate: () => of(state) } }] });
  });
  async function guard(path: string): Promise<unknown> {
    const result = TestBed.runInInjectionContext(() => customerGuard({ data: {  } } as never, { url: path } as never));
    return isObservable(result) ? firstValueFrom(result) : result;
  }
  it('redirects anonymous or indeterminate sessions to the unified login', async () => {
    for (const access of [AccessState.Anonymous, AccessState.Indeterminate]) {
      state = access;
      expect(String(await guard('/customer/orders'))).toContain('/login?returnTo=CUSTOMER_ORDERS');
    }
  });
  it('accepts only the active verified realm', async () => {
    state = AccessState.resolve(buyer, operator, AccessContext.Customer);
    expect(await guard('/customer/orders')).toBe(true);
    state = AccessState.resolve(buyer, operator, AccessContext.User);
    expect(await guard('/customer/orders')).toBeInstanceOf(UrlTree);
  });
  it('drops malicious return paths at the boundary', async () => {
    expect(String(await guard('/customer/orders?returnTo=https://evil.test'))).toBe('/login?returnTo=HOME');
  });
});
