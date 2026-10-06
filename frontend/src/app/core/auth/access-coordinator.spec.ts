import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AccessContext } from '../../domain/access/access-context';
import { AccessState, AccessStateKind, ProbeOutcome, SessionProbe } from '../../domain/access/session-probe';
import { UserRole } from '../../domain/user/user-role';
import { AccessCoordinator, ActiveContextHint } from './access-coordinator';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';
import { CSRF_HEADER } from './csrf';
import { AccessSessionStaging } from './access-session-staging';

const customer = { email: 'customer@example.test', firstName: 'C', lastName: 'P', phone: '' };
const user = { id: 'user-1', roles: [UserRole.Operator] };

describe('closed rehydration matrix', () => {
  const authenticated = SessionProbe.authenticated(customer, 'csrf');
  const cases = [authenticated, SessionProbe.Anonymous, SessionProbe.Unavailable, SessionProbe.Unknown];
  for (const customerResult of cases) for (const userResult of cases) {
    it('resolves independent realm outcomes without granting failed probes authority', () => {
      const state = AccessState.resolve(customerResult, userResult, AccessContext.Unknown);
      const count = Number(customerResult.outcome === ProbeOutcome.Authenticated) + Number(userResult.outcome === ProbeOutcome.Authenticated);
      expect(state.contexts.length).toBe(count);
      expect(state.kind).toBe(count === 2 ? AccessStateKind.SelectionRequired : count === 1 ? AccessStateKind.Selected
        : customerResult === SessionProbe.Anonymous && userResult === SessionProbe.Anonymous ? AccessStateKind.Anonymous : AccessStateKind.Indeterminate);
    });
  }
  it('accepts a hint only among successful probes', () => {
    expect(AccessState.resolve(authenticated, SessionProbe.Anonymous, AccessContext.User).activeContext).toBe(AccessContext.Customer);
    expect(AccessState.resolve(authenticated, authenticated, AccessContext.User).activeContext).toBe(AccessContext.User);
  });
});

describe('AccessCoordinator', () => {
  let access: AccessCoordinator;
  let http: HttpTestingController;
  let customerSession: CustomerSession;
  let userSession: UserSession;
  let hint: AccessContext;
  let staging: AccessSessionStaging;
  const url = (path: string): string => `${environment.apiBaseUrl}/${path}`;
  beforeEach(() => {
    hint = AccessContext.Unknown;
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: ActiveContextHint, useValue: { read: () => hint, write: (value: AccessContext) => { hint = value; } } }] });
    access = TestBed.inject(AccessCoordinator);
    http = TestBed.inject(HttpTestingController);
    customerSession = TestBed.inject(CustomerSession);
    userSession = TestBed.inject(UserSession);
    staging = TestBed.inject(AccessSessionStaging);
  });
  afterEach(() => http.verify());
  function flushCustomer(): void {
    http.expectOne(url('customer/me')).flush(customer);
    http.expectOne(url('customer/auth/csrf')).flush({}, { headers: { [CSRF_HEADER]: 'customer-csrf' } });
  }
  function flushUser(): void {
    http.expectOne(url('internal/me')).flush({ id: user.id, roles: user.roles.map((role) => role.wire) });
    http.expectOne(url('internal/auth/csrf')).flush({}, { headers: { [CSRF_HEADER]: 'user-csrf' } });
  }
  function absent(path: string): void { http.expectOne(url(path)).flush({}, { status: 401, statusText: 'Unauthorized' }); }

  it('deduplicates a reload flight and publishes principal plus CSRF atomically', async () => {
    const flight = access.rehydrate();
    expect(access.rehydrate()).toBe(flight);
    const result = firstValueFrom(flight);
    http.expectOne(url('customer/me')).flush(customer);
    expect(customerSession.principal()).toBeNull();
    expect(customerSession.authenticated()).toBe(false);
    http.expectOne(url('customer/auth/csrf')).flush({}, { headers: { [CSRF_HEADER]: 'customer-csrf' } });
    absent('internal/me');
    expect((await result).activeContext).toBe(AccessContext.Customer);
    expect(customerSession.principal()).toEqual(customer);
    expect(customerSession.csrf()).toBe('customer-csrf');
  });
  it('accepts backend numeric principal ids and customer /me without phone', async () => {
    const result = firstValueFrom(access.rehydrate());
    http.expectOne(url('customer/me')).flush({ id: 12, email: customer.email, firstName: customer.firstName, lastName: customer.lastName });
    http.expectOne(url('customer/auth/csrf')).flush({}, { headers: { [CSRF_HEADER]: 'customer-csrf' } });
    http.expectOne(url('internal/me')).flush({ id: 42, roles: [UserRole.Operator.wire] });
    http.expectOne(url('internal/auth/csrf')).flush({}, { headers: { [CSRF_HEADER]: 'user-csrf' } });
    await result;
    expect(customerSession.principal()).toEqual({ ...customer, id: '12' });
    expect(userSession.principal()).toEqual({ id: '42', roles: [UserRole.Operator] });
  });
  it('preserves prior local state on indeterminate failure without granting authority', async () => {
    customerSession.commit(customer, 'old-customer');
    userSession.commit(user, 'old-user');
    const result = firstValueFrom(access.rehydrate());
    http.expectOne(url('customer/me')).flush({}, { status: 503, statusText: 'Unavailable' });
    http.expectOne(url('internal/me')).flush({ id: 'unsupported', roles: ['FUTURE'] });
    expect((await result).kind).toBe(AccessStateKind.Indeterminate);
    expect(access.state().permits(AccessContext.User)).toBe(false);
    expect(customerSession.csrf()).toBe('old-customer');
    expect(userSession.roles()).toEqual([UserRole.Operator]);
  });
  it('does not publish a principal when CSRF is missing and preserves the successful other realm', async () => {
    const result = firstValueFrom(access.rehydrate());
    http.expectOne(url('customer/me')).flush(customer);
    http.expectOne(url('customer/auth/csrf')).flush({});
    flushUser();
    expect((await result).activeContext).toBe(AccessContext.User);
    expect(customerSession.principal()).toBeNull();
    expect(userSession.roles()).toEqual([UserRole.Operator]);
  });
  it('treats a CSRF 401 as anonymous only for its realm', async () => {
    customerSession.commit(customer, 'old');
    const result = firstValueFrom(access.rehydrate());
    http.expectOne(url('customer/me')).flush(customer);
    absent('customer/auth/csrf');
    flushUser();
    await result;
    expect(customerSession.principal()).toBeNull();
    expect(customerSession.csrf()).toBe('');
    expect(userSession.authenticated()).toBe(true);
  });
  it('confirms anonymous only after two realm 401 results and clears both', async () => {
    customerSession.commit(customer, 'customer'); userSession.commit(user, 'user');
    const result = firstValueFrom(access.rehydrate());
    absent('customer/me'); absent('internal/me');
    expect((await result).kind).toBe(AccessStateKind.Anonymous);
    expect(customerSession.principal()).toBeNull(); expect(userSession.principal()).toBeNull();
    expect(customerSession.csrf()).toBe(''); expect(userSession.csrf()).toBe('');
  });
  it('does not install CSRF from a malformed response even with a header', async () => {
    const result = firstValueFrom(access.rehydrate());
    http.expectOne(url('customer/me')).flush(customer);
    http.expectOne(url('customer/auth/csrf')).flush('malformed', { headers: { [CSRF_HEADER]: 'must-not-install' } });
    absent('internal/me');
    expect((await result).kind).toBe(AccessStateKind.Indeterminate);
    expect(customerSession.csrf()).toBe('');
  });
  it('preserves local state after CSRF transport failure without publishing staged identity', async () => {
    userSession.commit(user, 'old-user');
    const result = firstValueFrom(access.rehydrate());
    absent('customer/me');
    http.expectOne(url('internal/me')).flush({ id: 'different', roles: [UserRole.Admin.wire] });
    http.expectOne(url('internal/auth/csrf')).flush({}, { status: 503, statusText: 'Unavailable' });
    expect((await result).kind).toBe(AccessStateKind.Indeterminate);
    expect(userSession.principal()).toEqual(user);
    expect(userSession.csrf()).toBe('old-user');
  });
  it('suppresses stale results after a newer authenticated login', async () => {
    const oldResult = lastValueFrom(access.rehydrate(), { defaultValue: AccessState.Indeterminate });
    const oldCustomer = http.expectOne(url('customer/me'));
    const oldUser = http.expectOne(url('internal/me'));
    staging.stage(AccessContext.User, 'user-csrf');
    const newResult = firstValueFrom(access.acceptAuthenticated(AccessContext.User));
    expect(oldCustomer.cancelled).toBe(true);
    expect(oldUser.cancelled).toBe(true);
    http.expectOne(url('internal/me')).flush({ id: user.id, roles: user.roles.map((role) => role.wire) });
    http.expectNone(url('internal/auth/csrf'));
    await newResult;
    http.expectNone(url('customer/auth/csrf'));
    expect((await oldResult).kind).toBe(AccessStateKind.Indeterminate);
    expect(userSession.csrf()).toBe('user-csrf');
    expect(customerSession.authenticated()).toBe(false);
    expect(access.state().activeContext).toBe(AccessContext.User);
  });
  it('removes the previous same-realm actor before probing a newly issued session', async () => {
    userSession.commit(user, 'actor-a-csrf');
    customerSession.commit(customer, 'customer-csrf');
    staging.stage(AccessContext.User, 'actor-b-csrf');
    const result = firstValueFrom(access.acceptAuthenticated(AccessContext.User));
    expect(userSession.authenticated()).toBe(false);
    expect(userSession.principal()).toBeNull();
    expect(userSession.csrf()).toBe('');
    expect(customerSession.principal()).toEqual(customer);
    http.expectOne(url('internal/me')).flush({}, { status: 503, statusText: 'Unavailable' });
    expect((await result).kind).toBe(AccessStateKind.Indeterminate);
    expect(userSession.authenticated()).toBe(false);
    expect(customerSession.csrf()).toBe('customer-csrf');
  });
  it('requires local choice for two sessions and sends no context-selection request', async () => {
    const result = firstValueFrom(access.rehydrate());
    flushCustomer(); flushUser();
    expect((await result).kind).toBe(AccessStateKind.SelectionRequired);
    expect(access.selectContext(AccessContext.User).activeContext).toBe(AccessContext.User);
    expect(hint).toBe(AccessContext.User);
    http.expectNone(url('auth/context-selection'));
  });
  it('logs out only the selected realm and preserves the other principal and CSRF', async () => {
    const result = firstValueFrom(access.rehydrate());
    flushCustomer(); flushUser(); await result;
    access.selectContext(AccessContext.User);
    const logout = firstValueFrom(access.logout());
    const req = http.expectOne(url('internal/auth/logout'));
    expect(req.request.headers.get(CSRF_HEADER)).toBe('user-csrf');
    req.flush({}); await logout;
    expect(userSession.principal()).toBeNull();
    expect(customerSession.principal()).toEqual(customer);
    expect(customerSession.csrf()).toBe('customer-csrf');
    expect(access.state().activeContext).toBe(AccessContext.Customer);
  });
  it('suppresses an in-flight probe after logout', async () => {
    userSession.commit(user, 'accepted');
    const result = lastValueFrom(access.rehydrate(), { defaultValue: AccessState.Indeterminate });
    const pending = http.expectOne(url('internal/me'));
    absent('customer/me');
    const logout = firstValueFrom(access.logout(AccessContext.User));
    expect(pending.cancelled).toBe(true);
    http.expectOne(url('internal/auth/logout')).flush({}); await logout;
    http.expectNone(url('internal/auth/csrf'));
    await result;
    expect(userSession.authenticated()).toBe(false);
    expect(userSession.csrf()).toBe('');
  });
  it('role loss cannot grant cached user authority', async () => {
    userSession.commit(user, 'previous');
    const result = firstValueFrom(access.rehydrate());
    absent('customer/me');
    http.expectOne(url('internal/me')).flush({ id: user.id, roles: [] });
    expect((await result).permits(AccessContext.User)).toBe(false);
    http.expectNone(url('internal/auth/csrf'));
  });
});
