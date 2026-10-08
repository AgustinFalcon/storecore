import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AccessContext } from '../../domain/access/access-context';
import { AccessStateKind } from '../../domain/access/session-probe';
import { UserRole } from '../../domain/user/user-role';
import { AccessCoordinator, ActiveContextHint } from './access-coordinator';
import { AccessSessionStaging } from './access-session-staging';
import { AccessHttpRepository } from '../../data/access/access-http.repository';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';
import { CSRF_HEADER } from './csrf';
import { authInterceptor } from './auth.interceptor';

const buyer = { id: 'buyer-a', email: 'buyer@example.test', firstName: 'Buyer', lastName: 'A', phone: '' };
const operator = { id: 'operator-a', roles: [UserRole.Operator] };

describe('AccessCoordinator queue and realm ownership', () => {
  let access: AccessCoordinator;
  let http: HttpTestingController;
  let client: HttpClient;
  let customer: CustomerSession;
  let user: UserSession;
  let hint: AccessContext;
  const url = (path: string) => `${environment.apiBaseUrl}/${path}`;
  beforeEach(() => {
    hint = AccessContext.Unknown;
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), AccessHttpRepository,
      { provide: ActiveContextHint, useValue: { read: () => hint, write: (next: AccessContext) => { hint = next; } } }] });
    access = TestBed.inject(AccessCoordinator); http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient); customer = TestBed.inject(CustomerSession); user = TestBed.inject(UserSession);
  });
  afterEach(() => http.verify());
  function probeCustomer(id = buyer.id): void {
    http.expectOne(url('customer/me')).flush({ ...buyer, id });
    http.expectOne(url('customer/auth/csrf')).flush({}, { headers: { [CSRF_HEADER]: 'customer-csrf' } });
  }
  function probeUser(): void {
    http.expectOne(url('internal/me')).flush({ id: operator.id, roles: operator.roles.map(role => role.wire) });
    http.expectOne(url('internal/auth/csrf')).flush({}, { headers: { [CSRF_HEADER]: 'user-csrf' } });
  }
  function anonymous(path: string): void { http.expectOne(url(path)).flush({}, { status: 401, statusText: 'Unauthorized' }); }

  it('coalesces reload and publishes principal with authoritative CSRF', async () => {
    const flight = access.rehydrate(); expect(access.rehydrate()).toBe(flight);
    const result = firstValueFrom(flight);
    probeCustomer(); expect(customer.authenticated()).toBe(false);
    anonymous('internal/me');
    expect((await result).activeContext).toBe(AccessContext.Customer);
    expect(customer.actorId()).toBe(buyer.id); expect(customer.csrf()).toBe('customer-csrf');
  });
  it('requires local selection for two realms and rejects unavailable choices', async () => {
    const result = firstValueFrom(access.rehydrate()); probeCustomer(); probeUser();
    expect((await result).kind).toBe(AccessStateKind.SelectionRequired);
    expect(access.selectContext(AccessContext.User).activeContext).toBe(AccessContext.User);
    expect(hint).toBe(AccessContext.User);
    customer.clear(); expect(access.selectContext(AccessContext.Customer).activeContext).toBe(AccessContext.User);
    http.expectNone(url('auth/context-selection'));
  });
  it('invalid hints, missing actor, unknown role and missing CSRF grant no authority', async () => {
    hint = AccessContext.User;
    const result = firstValueFrom(access.rehydrate());
    http.expectOne(url('customer/me')).flush({ ...buyer, id: undefined });
    http.expectOne(url('internal/me')).flush({ id: operator.id, roles: [UserRole.Admin.wire, 'future'] });
    expect((await result).kind).toBe(AccessStateKind.Indeterminate);
    expect(customer.authenticated()).toBe(false); expect(user.authenticated()).toBe(false);
    const second = firstValueFrom(access.rehydrate());
    http.expectOne(url('customer/me')).flush(buyer); http.expectOne(url('customer/auth/csrf')).flush({});
    anonymous('internal/me'); expect((await second).kind).toBe(AccessStateKind.Indeterminate);
  });
  it('reconciles a staged login using fresh me and CSRF before accepting actor B', async () => {
    customer.commit(buyer, 'a-csrf');
    TestBed.inject(AccessSessionStaging).stage(AccessContext.Customer, 'login-csrf');
    const result = firstValueFrom(access.acceptAuthenticated(AccessContext.Customer));
    expect(customer.actorId()).toBeNull(); expect(customer.authenticated()).toBe(false);
    http.expectOne(url('customer/me')).flush({ ...buyer, id: 'buyer-b' });
    expect(customer.authenticated()).toBe(false);
    http.expectOne(url('customer/auth/csrf')).flush({}, { headers: { [CSRF_HEADER]: 'authoritative-b' } });
    await result; expect(customer.actorId()).toBe('buyer-b'); expect(customer.csrf()).toBe('authoritative-b');
  });
  it('keeps logout cold, coalesced and independent of the other realm', async () => {
    const reload = firstValueFrom(access.rehydrate()); probeCustomer(); probeUser(); await reload;
    const command = access.logout(AccessContext.User); expect(access.logout(AccessContext.User)).toBe(command);
    http.expectNone(url('internal/auth/logout')); expect(user.authenticated()).toBe(true);
    const first = firstValueFrom(command); const second = firstValueFrom(command);
    http.expectOne(url('internal/auth/logout')).flush({}); await Promise.all([first, second]);
    expect(user.actorId()).toBeNull(); expect(customer.actorId()).toBe(buyer.id); expect(customer.csrf()).toBe('customer-csrf');
  });
  it('retains sent write ownership through destroy and uses its rotated token for logout', async () => {
    customer.commit(buyer, 'before-write');
    const component = client.put(url('customer/me'), {}).subscribe();
    const write = http.expectOne(url('customer/me')); component.unsubscribe();
    const logout = firstValueFrom(access.logout(AccessContext.Customer));
    http.expectNone(url('customer/auth/logout')); expect(write.cancelled).toBe(false);
    write.flush({}, { headers: { [CSRF_HEADER]: 'after-write' } });
    const revoke = http.expectOne(url('customer/auth/logout'));
    expect(revoke.request.headers.get(CSRF_HEADER)).toBe('after-write'); revoke.flush({}); await logout;
  });
  it('cancels queued old writes while a dispatched write settles before reload', async () => {
    customer.commit(buyer, 'initial');
    const active = firstValueFrom(client.put(url('customer/me'), {}), { defaultValue: undefined });
    const sent = http.expectOne(url('customer/me'));
    const queued = firstValueFrom(client.put(url('customer/me/addresses/1'), {})).catch(error => error);
    const reload = firstValueFrom(access.rehydrate());
    http.expectNone(url('customer/me')); anonymous('internal/me');
    sent.flush({}, { headers: { [CSRF_HEADER]: 'rotated' } });
    expect((await queued).name).toBe('SessionMutationCancelledError'); await active;
    probeCustomer('buyer-b'); await reload;
    expect(customer.actorId()).toBe('buyer-b'); http.expectNone(url('customer/me/addresses/1'));
  });
  it('does not resurrect authority from a dispatched probe superseded by logout', async () => {
    user.commit(operator, 'old-token');
    const reload = firstValueFrom(access.rehydrate()); const pending = http.expectOne(url('internal/me'));
    anonymous('customer/me');
    const logout = firstValueFrom(access.logout(AccessContext.User));
    expect(pending.cancelled).toBe(false); http.expectNone(url('internal/auth/logout'));
    pending.flush({ id: operator.id, roles: [UserRole.Operator.wire] });
    http.expectOne(url('internal/auth/csrf')).flush({}, { headers: { [CSRF_HEADER]: 'stale-probe-token' } });
    http.expectOne(url('internal/auth/logout')).flush({}); await logout; await reload;
    expect(user.authenticated()).toBe(false); expect(user.csrf()).toBe('');
  });
  it('retries failed logout only with a fresh explicit command', async () => {
    user.commit(operator, 'token');
    const command = access.logout(AccessContext.User);
    const failure = firstValueFrom(command).catch(error => error);
    http.expectOne(url('internal/auth/logout')).flush({}, { status: 503, statusText: 'Unavailable' }); await failure;
    await firstValueFrom(command).catch(() => undefined); http.expectNone(url('internal/auth/logout'));
    expect(user.authenticated()).toBe(false); expect(user.actorId()).toBe(operator.id);
    const retry = firstValueFrom(access.logout(AccessContext.User)); http.expectOne(url('internal/auth/logout')).flush({}); await retry;
    expect(user.actorId()).toBeNull();
  });
  it('unified credentials wait behind both existing mutation owners', async () => {
    customer.commit(buyer, 'customer'); user.commit(operator, 'user');
    const first = firstValueFrom(client.put(url('customer/me'), {}), { defaultValue: undefined });
    const second = firstValueFrom(client.put(url('user/content/home'), {}), { defaultValue: undefined });
    const customerWrite = http.expectOne(url('customer/me')); const userWrite = http.expectOne(url('user/content/home'));
    access.supersedeProbes();
    const login = firstValueFrom(TestBed.inject(AccessHttpRepository).signIn({ email: buyer.email, password: 'valid-password' }));
    http.expectNone(url('auth/login'));
    customerWrite.flush({}, { headers: { [CSRF_HEADER]: 'new-customer' } }); http.expectNone(url('auth/login'));
    userWrite.flush({}, { headers: { [CSRF_HEADER]: 'new-user' } });
    http.expectOne(url('auth/login')).flush({}, { status: 401, statusText: 'Rejected' });
    await Promise.all([first, second, login]);
  });
});
