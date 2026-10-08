import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { CSRF_HEADER } from '../../core/auth/csrf';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { AccessMutationFence } from '../../core/auth/access-mutation-fence';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessSessionStaging } from '../../core/auth/access-session-staging';
import { AccessContext } from '../../domain/access/access-context';
import { AccessHome } from '../../domain/access/access-home';
import { LoginResolution, LoginResult } from '../../domain/access/login-resolution';
import { ReturnDestination } from '../../domain/access/return-destination';
import { AccessHttpRepository } from './access-http.repository';
const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const authenticated = (context: AccessContext) => envelope({ kind: LoginResolution.Authenticated.wire, context: context.wire, home: AccessHome.forContext(context).wire, destination: { kind: ReturnDestination.Home.wire } });
describe('unified access HTTP repository', () => {
  let repository: AccessHttpRepository;
  let ctrl: HttpTestingController;
  let customer: CustomerSession;
  let user: UserSession;
  let staging: AccessSessionStaging;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), AccessHttpRepository] });
    repository = TestBed.inject(AccessHttpRepository);
    ctrl = TestBed.inject(HttpTestingController);
    customer = TestBed.inject(CustomerSession);
    user = TestBed.inject(UserSession);
    staging = TestBed.inject(AccessSessionStaging);
    customer.setCsrf('previous-customer'); user.setCsrf('previous-user');
  });
  afterEach(() => ctrl.verify());
  it('blocks credential and same-realm challenge HTTP before issuing cookies during revoke, including cold commands', async () => {
    const coordinator = TestBed.inject(AccessCoordinator);
    const credentials = { email: 'test@example.test', password: 'sample-password' };
    const cold = repository.signIn(credentials);
    const logout = firstValueFrom(coordinator.logout(AccessContext.Customer));
    const revoke = ctrl.expectOne(`${environment.apiBaseUrl}/customer/auth/logout`);
    coordinator.supersedeProbes();
    expect((await firstValueFrom(cold)).resolution).toBe(LoginResolution.Unavailable);
    expect((await firstValueFrom(repository.selectContext('c'.repeat(40), AccessContext.Customer))).resolution).toBe(LoginResolution.Unavailable);
    ctrl.expectNone(`${environment.apiBaseUrl}/auth/login`);
    ctrl.expectNone(`${environment.apiBaseUrl}/auth/context-selection`);
    expect(staging.take(AccessContext.Customer)).toBeNull();
    revoke.flush({}); await logout;
    const login = firstValueFrom(repository.signIn(credentials));
    ctrl.expectOne(`${environment.apiBaseUrl}/auth/login`).flush(authenticated(AccessContext.Customer), { headers: { [CSRF_HEADER]: 'new-customer' } });
    expect((await login).resolution).toBe(LoginResolution.Authenticated);
    expect(staging.take(AccessContext.Customer)).toBe('new-customer');
  });
  it('uses the exact login body and cookies without attaching a realm token', async () => {
    const credentials = { email: 'test@example.test', password: 'sample-password', returnPath: '/catalog' };
    const pending = firstValueFrom(repository.signIn(credentials));
    const request = ctrl.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(credentials);
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has(CSRF_HEADER)).toBe(false);
    request.flush(authenticated(AccessContext.Customer), { headers: { [CSRF_HEADER]: 'new-customer' } });
    expect((await pending).resolution).toBe(LoginResolution.Authenticated);
    expect(customer.csrf()).toBe('previous-customer'); expect(user.csrf()).toBe('previous-user');
    expect(staging.take(AccessContext.Customer)).toBe('new-customer');
    expect(customer.authenticated()).toBe(false);
  });
  it('uses exactly /auth/context-selection and installs only the authenticated response realm', async () => {
    const challenge = 'a'.repeat(40);
    const pending = firstValueFrom(repository.selectContext(challenge, AccessContext.User));
    const request = ctrl.expectOne(`${environment.apiBaseUrl}/auth/context-selection`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ challenge, context: AccessContext.User.wire });
    expect(request.request.withCredentials).toBe(true);
    request.flush(authenticated(AccessContext.User), { headers: { [CSRF_HEADER]: 'new-user' } });
    expect((await pending).context).toBe(AccessContext.User);
    expect(user.csrf()).toBe('previous-user'); expect(customer.csrf()).toBe('previous-customer');
    expect(staging.take(AccessContext.User)).toBe('new-user');
  });
  it('preserves both accepted realms for challenge and unknown responses even with a CSRF header', async () => {
    customer.markAuthenticated(); user.markAuthenticated();
    for (const data of [{ kind: LoginResolution.ContextSelectionRequired.wire, challenge: 'a'.repeat(40), contexts: [AccessContext.Customer.wire, AccessContext.User.wire], expiresAt: '2026-10-06T10:00:00Z', destination: { kind: ReturnDestination.Home.wire } }, { kind: 'FUTURE' }]) {
      const pending = firstValueFrom(repository.signIn({ email: 'test@example.test', password: 'sample-password' }));
      ctrl.expectOne(`${environment.apiBaseUrl}/auth/login`).flush(envelope(data), { headers: { [CSRF_HEADER]: 'must-not-install' } });
      await pending;
      expect(customer.csrf()).toBe('previous-customer'); expect(user.csrf()).toBe('previous-user');
      expect(staging.take(AccessContext.Customer)).toBeNull(); expect(staging.take(AccessContext.User)).toBeNull();
      expect(customer.authenticated()).toBe(true); expect(user.authenticated()).toBe(true);
    }
  });
  it('fails closed when authentication lacks CSRF or has an unknown realm', async () => {
    for (const data of [authenticated(AccessContext.Customer), authenticated(AccessContext.Unknown)]) {
      const pending = firstValueFrom(repository.signIn({ email: 'test@example.test', password: 'sample-password' }));
      ctrl.expectOne(`${environment.apiBaseUrl}/auth/login`).flush(data);
      expect(await pending).toBe(LoginResult.Unknown);
      expect(customer.csrf()).toBe('previous-customer'); expect(user.csrf()).toBe('previous-user');
      expect(staging.take(AccessContext.Customer)).toBeNull(); expect(staging.take(AccessContext.User)).toBeNull();
    }
  });
  it('never submits an unknown selection context', async () => {
    expect(await firstValueFrom(repository.selectContext('a'.repeat(40), AccessContext.Unknown))).toBe(LoginResult.Unknown);
  });
  it('does not accept a selection response for a different context', async () => {
    const pending = firstValueFrom(repository.selectContext('a'.repeat(40), AccessContext.User));
    ctrl.expectOne(`${environment.apiBaseUrl}/auth/context-selection`).flush(authenticated(AccessContext.Customer), { headers: { [CSRF_HEADER]: 'must-not-install' } });
    expect(await pending).toBe(LoginResult.Unknown);
    expect(customer.csrf()).toBe('previous-customer'); expect(user.csrf()).toBe('previous-user');
    expect(staging.take(AccessContext.Customer)).toBeNull(); expect(staging.take(AccessContext.User)).toBeNull();
  });
  it('discards a response invalidated by a newer login, logout or probe generation', async () => {
    const fence = TestBed.inject(AccessMutationFence);
    const pending = firstValueFrom(repository.signIn({ email: 'test@example.test', password: 'sample-password' }));
    const request = ctrl.expectOne(`${environment.apiBaseUrl}/auth/login`);
    fence.advance();
    request.flush(authenticated(AccessContext.Customer), { headers: { [CSRF_HEADER]: 'must-not-install' } });
    expect(await pending).toBe(LoginResult.Unknown);
    expect(customer.csrf()).toBe('previous-customer');
    expect(user.csrf()).toBe('previous-user');
    expect(staging.take(AccessContext.Customer)).toBeNull();
  });
  it('discards a stale context-selection challenge before it reaches flow state', async () => {
    const fence = TestBed.inject(AccessMutationFence);
    const pending = firstValueFrom(repository.signIn({ email: 'test@example.test', password: 'sample-password' }));
    const request = ctrl.expectOne(`${environment.apiBaseUrl}/auth/login`);
    fence.advance(AccessContext.User);
    request.flush(envelope({
      kind: LoginResolution.ContextSelectionRequired.wire,
      challenge: 'a'.repeat(40),
      contexts: [AccessContext.Customer.wire, AccessContext.User.wire],
      expiresAt: '2026-10-06T10:00:00Z',
      destination: { kind: ReturnDestination.Home.wire },
    }));
    expect(await pending).toBe(LoginResult.Unknown);
  });
  it('never retries rejection, rate limiting or unavailable transport and preserves realm state', async () => {
    for (const status of [401, 403, 429, 500, 0]) {
      const pending = firstValueFrom(repository.selectContext('a'.repeat(40), AccessContext.User));
      ctrl.expectOne(`${environment.apiBaseUrl}/auth/context-selection`).flush({}, { status, statusText: 'failure' });
      expect(await pending).toBe(status >= 400 && status < 500 ? LoginResult.Rejected : LoginResult.Unavailable);
      ctrl.expectNone(`${environment.apiBaseUrl}/auth/context-selection`);
      expect(customer.csrf()).toBe('previous-customer'); expect(user.csrf()).toBe('previous-user');
    }
  });
});
