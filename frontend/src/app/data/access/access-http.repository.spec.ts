import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { IdentityRealm, LoginResolution, LoginResolutionKind } from '../../domain/access/access.types';
import { AccessHttpRepository } from './access-http.repository';

describe('AccessHttpRepository session boundary', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), AccessHttpRepository] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  const authenticated = (context: string, home: string) => ({ code: 200, data: { kind: 'AUTHENTICATED', context, home, destination: { kind: 'HOME' } } });
  it('issues only the mapped realm CSRF/session, preserving the other realm', async () => {
    const customer = TestBed.inject(CustomerSession);
    const user = TestBed.inject(UserSession);
    user.setCsrf('existing-user'); user.markAuthenticated();
    const pending = firstValueFrom(TestBed.inject(AccessHttpRepository).authenticate({ email: 'a@b.c', password: 'password1234' }));
    const req = TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/login');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.has('X-CSRF-Token')).toBe(false);
    req.flush(authenticated('CUSTOMER', 'STOREFRONT'), { headers: { 'X-CSRF-Token': 'customer-csrf' } });
    expect((await pending).kind).toBe(LoginResolutionKind.Authenticated);
    expect(customer.authenticated()).toBe(true);
    expect(customer.csrf()).toBe('customer-csrf');
    expect(user.csrf()).toBe('existing-user');
  });
  it('sets neither session nor CSRF for a challenge despite headers', async () => {
    const pending = firstValueFrom(TestBed.inject(AccessHttpRepository).authenticate({ email: 'a@b.c', password: 'password1234' }));
    TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/login').flush({ code: 200, data: { kind: 'CONTEXT_SELECTION_REQUIRED', challenge: 'a'.repeat(32), contexts: ['CUSTOMER', 'USER'], expiresAt: '2030-01-01T00:00:00Z' } }, { headers: { 'X-CSRF-Token': 'must-ignore' } });
    expect((await pending).kind).toBe(LoginResolutionKind.ContextSelectionRequired);
    expect(TestBed.inject(CustomerSession).authenticated()).toBe(false);
    expect(TestBed.inject(UserSession).csrf()).toBe('');
  });
  it('fails closed for unknown wire and absent CSRF', async () => {
    for (const body of [authenticated('OTHER', 'OPERATIONS'), authenticated('USER', 'OPERATIONS')]) {
      const pending = firstValueFrom(TestBed.inject(AccessHttpRepository).authenticate({ email: 'a@b.c', password: 'password1234' }));
      TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/login').flush(body);
      expect(await pending).toBe(LoginResolution.Unknown);
    }
    expect(TestBed.inject(UserSession).authenticated()).toBe(false);
  });
  it('rejects context substitution before applying response headers', async () => {
    const pending = firstValueFrom(TestBed.inject(AccessHttpRepository).select('a'.repeat(32), IdentityRealm.Customer));
    const req = TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/context-selection');
    expect(req.request.body).toEqual({ challenge: 'a'.repeat(32), context: IdentityRealm.Customer.wire });
    req.flush(authenticated('USER', 'OPERATIONS'), { headers: { 'X-CSRF-Token': 'wrong' } });
    expect(await pending).toBe(LoginResolution.Unknown);
    expect(TestBed.inject(UserSession).authenticated()).toBe(false);
  });
  it('maps generic rejection without clearing unrelated existing sessions', async () => {
    const user = TestBed.inject(UserSession); user.markAuthenticated(); user.setCsrf('existing');
    const pending = firstValueFrom(TestBed.inject(AccessHttpRepository).authenticate({ email: 'a@b.c', password: 'password1234' }));
    TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/login').flush({ message: 'sensitive' }, { status: 401, statusText: 'Unauthorized' });
    expect(await pending).toBe(LoginResolution.Rejected);
    expect(user.authenticated()).toBe(true);
    expect(user.csrf()).toBe('existing');
  });
});
