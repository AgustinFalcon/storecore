import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AccessContext } from '../../domain/access/access-context';
import { AccessStateKind } from '../../domain/access/session-probe';
import { UserRole } from '../../domain/user/user-role';
import { LoginResolution, LoginResult } from '../../domain/access/login-resolution';
import { AccessHome } from '../../domain/access/access-home';
import { ReturnDestination } from '../../domain/access/return-destination';
import { CustomerHttpRepository } from '../../data/customer/customer-http.repository';
import { RegisterCustomerUseCase } from '../../domain/customer/use-cases/register-customer.usecase';
import { CustomerStore } from '../../features/identity/customer.store';
import { Router } from '@angular/router';
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
  for (const realm of [AccessContext.Customer, AccessContext.User]) {
    it(`preserves queued ${realm.wire} logout when a login supersedes probes behind a sent write`, async () => {
      customer.commit(buyer, 'customer-old'); user.commit(operator, 'user-old');
      const path = realm === AccessContext.Customer ? 'customer/me' : 'user/content/home';
      const session = realm === AccessContext.Customer ? customer : user;
      const write = firstValueFrom(client.put(url(path), {}), { defaultValue: undefined });
      const sent = http.expectOne(url(path));
      const logout = firstValueFrom(access.logout(realm));
      const revocationGeneration = session.generation();
      // LoginStore.submit invokes this before the rejected credential command.
      access.supersedeProbes(); access.supersedeProbes(realm);
      if (realm === AccessContext.Customer) expect(access.beginCustomerRegistration()).toBe(false);
      expect(session.generation()).toBe(revocationGeneration);
      const login = await firstValueFrom(TestBed.inject(AccessHttpRepository).signIn({ email: buyer.email, password: 'valid-password' }));
      expect(login.resolution).toBe(LoginResolution.Unavailable);
      http.expectNone(url('auth/login'));
      const logoutPath = `${realm === AccessContext.Customer ? 'customer' : 'internal'}/auth/logout`;
      http.expectNone(url(logoutPath));
      sent.flush({}, { headers: { [CSRF_HEADER]: 'write-rotated-current' } });
      const revoke = http.expectOne(url(logoutPath));
      expect(revoke.request.headers.get(CSRF_HEADER)).toBe('write-rotated-current');
      revoke.flush({}); await logout; await write;
      expect(session.authenticated()).toBe(false); expect(session.actorId()).toBeNull(); expect(session.csrf()).toBe('');
    });
  }
  for (const anonymousResult of [false, true]) {
    it(`cannot apply old CUSTOMER ${anonymousResult ? '401' : 'principal A'} after registration B while USER probe is delayed`, async () => {
      customer.commit(buyer, 'a-token');
      const initial = firstValueFrom(access.rehydrate()); probeCustomer(); anonymous('internal/me'); await initial;
      const reload = firstValueFrom(access.rehydrate());
      const delayedUser = http.expectOne(url('internal/me'));
      if (anonymousResult) anonymous('customer/me'); else probeCustomer();
      const registration = new RegisterCustomerUseCase(new CustomerHttpRepository(client), customer);
      const registered = firstValueFrom(registration.execute({ email: 'b@example.test', password: 'valid-password', firstName: 'B', lastName: 'Buyer' }));
      http.expectOne(url('customer/auth/register')).flush({ id: 'buyer-b', email: 'b@example.test', firstName: 'B', lastName: 'Buyer' },
        { headers: { [CSRF_HEADER]: 'registration-b-token' } });
      expect((await registered).id).toBe('buyer-b');
      const generationB = customer.generation();
      expect(customer.authenticated()).toBe(true); expect(customer.csrf()).toBe('registration-b-token');
      delayedUser.flush({}, { status: 401, statusText: 'Unauthorized' });
      const state = await reload;
      expect(customer.generation()).toBe(generationB);
      expect(customer.authenticated()).toBe(true); expect(customer.actorId()).toBeNull();
      expect(customer.csrf()).toBe('registration-b-token');
      expect(state.activeContext).toBe(AccessContext.Unknown);
      expect(state.kind).toBe(AccessStateKind.Indeterminate);
    });
  }
  it('fences hydration A before registration B dispatch when USER finishes before the registration response', async () => {
    const initial = firstValueFrom(access.rehydrate()); probeCustomer(); anonymous('internal/me'); await initial;
    const reload = firstValueFrom(access.rehydrate());
    probeCustomer(); const delayedUser = http.expectOne(url('internal/me'));
    const registration = new RegisterCustomerUseCase(new CustomerHttpRepository(client), customer);
    const navigateByUrl = vi.fn();
    const store = new CustomerStore(registration, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, customer, { navigateByUrl } as unknown as Router, access);
    store.setEmail('b@example.test'); store.setPassword('valid-password'); store.setFirstName('B'); store.setLastName('Buyer');
    store.submitRegister();
    const dispatched = http.expectOne(url('customer/auth/register'));
    expect(dispatched.request.body).toEqual({ email: 'b@example.test', password: 'valid-password', firstName: 'B', lastName: 'Buyer' });
    expect(customer.authenticated()).toBe(false);
    delayedUser.flush({}, { status: 401, statusText: 'Unauthorized' }); await reload;
    expect(customer.actorId()).not.toBe(buyer.id);
    expect(customer.authenticated()).toBe(false);
    expect(access.state().activeContext).toBe(AccessContext.Unknown);
    expect(navigateByUrl).not.toHaveBeenCalled();
    dispatched.flush({ id: 'buyer-b', email: 'b@example.test', firstName: 'B', lastName: 'Buyer' },
      { headers: { [CSRF_HEADER]: 'registration-b-token' } });
    expect(customer.authenticated()).toBe(true); expect(customer.actorId()).toBeNull();
    expect(customer.csrf()).toBe('registration-b-token');
    expect(store.snapshot.authenticated).toBe(true); expect(store.snapshot.loading).toBe(false);
    expect(navigateByUrl).toHaveBeenCalledWith('/customer/profile');
    const verifiedB = firstValueFrom(access.rehydrate());
    http.expectOne(url('customer/me')).flush({ ...buyer, id: 'buyer-b' });
    http.expectOne(url('customer/auth/csrf')).flush({}, { headers: { [CSRF_HEADER]: 'registration-b-token' } });
    anonymous('internal/me'); await verifiedB;
    expect(customer.actorId()).toBe('buyer-b'); expect(customer.csrf()).toBe('registration-b-token');
    store.ngOnDestroy();
  });
  for (const status of [409, 503]) {
    it(`keeps registration draft through its own transition and ${status}, retries the same payload, but clears on external actor change`, () => {
      customer.commit(buyer, 'a-token');
      const registration = new RegisterCustomerUseCase(new CustomerHttpRepository(client), customer);
      const navigateByUrl = vi.fn();
      const store = new CustomerStore(registration, {} as never, {} as never, {} as never,
        {} as never, {} as never, {} as never, {} as never, customer, { navigateByUrl } as unknown as Router, access);
      const payload = { email: 'b@example.test', password: 'valid-password', firstName: 'B', lastName: 'Buyer' };
      store.setEmail(payload.email); store.setPassword(payload.password); store.setFirstName(payload.firstName); store.setLastName(payload.lastName);
      store.setProfile(buyer);
      store.submitRegister();
      const first = http.expectOne(url('customer/auth/register'));
      expect(first.request.body).toEqual(payload);
      expect(store.snapshot.loading).toBe(true);
      expect(store.snapshot.email).toBe(payload.email); expect(store.snapshot.password).toBe(payload.password);
      expect(store.snapshot.profile.email).toBe(''); expect(customer.authenticated()).toBe(false);
      first.flush({ message: 'Registration rejected' }, { status, statusText: 'Rejected' });
      expect(store.snapshot.loading).toBe(false); expect(store.snapshot.errorMessage).not.toBe('');
      expect(store.snapshot.email).toBe(payload.email); expect(store.snapshot.password).toBe(payload.password);
      expect(store.snapshot.firstName).toBe(payload.firstName); expect(store.snapshot.lastName).toBe(payload.lastName);
      store.submitRegister();
      const retry = http.expectOne(url('customer/auth/register'));
      expect(retry.request.body).toEqual(payload); expect(store.snapshot.loading).toBe(true);
      retry.flush({ message: 'Registration rejected' }, { status, statusText: 'Rejected' });
      customer.commit({ ...buyer, id: 'external-b' }, 'external-b-token');
      expect(store.snapshot.email).toBe(''); expect(store.snapshot.password).toBe('');
      expect(store.snapshot.firstName).toBe(''); expect(store.snapshot.lastName).toBe('');
      expect(store.snapshot.loading).toBe(false); expect(store.snapshot.errorMessage).toBe('');
      expect(store.snapshot.profile.email).toBe(''); expect(store.snapshot.addresses).toEqual([]);
      expect(navigateByUrl).not.toHaveBeenCalled(); store.ngOnDestroy();
    });
  }
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
    const revoke = http.expectOne(url('internal/auth/logout'));
    // Backend-like rotation: the new cookie accepts only its corresponding token.
    expect(revoke.request.headers.get(CSRF_HEADER)).toBe('stale-probe-token');
    expect(user.authenticated()).toBe(false);
    revoke.flush({}); await logout; await reload;
    expect(user.authenticated()).toBe(false); expect(user.csrf()).toBe('');
  });
  for (const realm of [AccessContext.Customer, AccessContext.User]) {
    it(`revokes a stale dispatched unified login in ${realm.wire} with its rotated token without accepting identity`, async () => {
      customer.commit(buyer, 'old-customer'); user.commit(operator, 'old-user');
      const login = firstValueFrom(TestBed.inject(AccessHttpRepository).signIn({ email: buyer.email, password: 'valid-password' }));
      const dispatched = http.expectOne(url('auth/login'));
      const logout = firstValueFrom(access.logout(realm));
      const path = realm === AccessContext.Customer ? 'customer' : 'internal';
      http.expectNone(url(`${path}/auth/logout`));
      dispatched.flush({ code: 200, data: { kind: LoginResolution.Authenticated.wire, context: realm.wire,
        home: AccessHome.forContext(realm).wire, destination: { kind: ReturnDestination.Home.wire } } },
      { headers: { [CSRF_HEADER]: 'rotated-login-cookie-token' } });
      expect(await login).toBe(LoginResult.Unknown);
      expect((realm === AccessContext.Customer ? customer : user).authenticated()).toBe(false);
      expect(TestBed.inject(AccessSessionStaging).take(realm)).toBeNull();
      const revoke = http.expectOne(url(`${path}/auth/logout`));
      expect(revoke.request.headers.get(CSRF_HEADER)).toBe('rotated-login-cookie-token');
      revoke.flush({}); await logout;
      const session = realm === AccessContext.Customer ? customer : user;
      expect(session.csrf()).toBe(''); expect(session.actorId()).toBeNull(); expect(session.authenticated()).toBe(false);
      expect(access.state().activeContext).not.toBe(realm);
    });
  }
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
