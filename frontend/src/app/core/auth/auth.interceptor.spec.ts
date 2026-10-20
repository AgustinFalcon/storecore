import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { CSRF_HEADER } from './csrf';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';
import { AccessMutationFence } from './access-mutation-fence';
import { AccessContext } from '../../domain/access/access-context';

describe('authInterceptor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
  });
  it('blocks legacy same-realm login and registration before sending a request during revoke', async () => {
    const fence = TestBed.inject(AccessMutationFence);
    fence.beginRevocation(AccessContext.Customer);
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    for (const path of ['/api/v1/customer/auth/login', '/api/v1/customer/auth/register']) {
      const error = await firstValueFrom(http.post(path, {})).catch((err: { status: number }) => err);
      expect((error as { status: number }).status).toBe(409);
      ctrl.expectNone(path);
    }
    const other = firstValueFrom(http.post('/api/v1/internal/auth/login', {}));
    ctrl.expectOne('/api/v1/internal/auth/login').flush({});
    await other;
    ctrl.verify();
  });

  it('sends credentials and CSRF on customer writes', async () => {
    TestBed.inject(CustomerSession).setCsrf('csrf-c');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);

    const pending = firstValueFrom(http.put('/api/v1/customer/me', { email: 'a@b.c' }));
    const req = ctrl.expectOne('/api/v1/customer/me');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get(CSRF_HEADER)).toBe('csrf-c');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ email: 'a@b.c', firstName: 'A', lastName: 'B', phone: '' }, { headers: { [CSRF_HEADER]: 'csrf-next' } });
    await pending;
    expect(TestBed.inject(CustomerSession).csrf()).toBe('csrf-next');
  });

  it('does not attach CSRF on login', async () => {
    TestBed.inject(CustomerSession).setCsrf('csrf-c');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(http.post('/api/v1/customer/auth/login', {}));
    const req = ctrl.expectOne('/api/v1/customer/auth/login');
    expect(req.request.headers.has(CSRF_HEADER)).toBe(false);
    expect(req.request.withCredentials).toBe(true);
    req.flush({ id: '1', email: 'a@b.c', firstName: 'A', lastName: 'B' });
    await pending;
  });

  it('attaches operator CSRF on /user writes', async () => {
    TestBed.inject(UserSession).setCsrf('csrf-u');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(http.post('/api/v1/user/promos', {}));
    const req = ctrl.expectOne('/api/v1/user/promos');
    expect(req.request.headers.get(CSRF_HEADER)).toBe('csrf-u');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
    await pending;
  });

  it('clears the customer session on 401', async () => {
    const session = TestBed.inject(CustomerSession);
    session.markAuthenticated();
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(http.get('/api/v1/customer/me')).catch((err) => err);
    const req = ctrl.expectOne('/api/v1/customer/me');
    req.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    await pending;
    expect(session.authenticated()).toBe(false);
  });

  it('refreshes CSRF once on CSRF_INVALID without retrying the write', async () => {
    const session = TestBed.inject(CustomerSession);
    session.setCsrf('stale');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(http.put('/api/v1/customer/me', {})).catch((err) => err);
    const write = ctrl.expectOne('/api/v1/customer/me');
    write.flush({ errorCode: 'CSRF_INVALID', message: 'bad' }, { status: 403, statusText: 'Forbidden' });
    await pending;
    const csrf = ctrl.expectOne('/api/v1/customer/auth/csrf');
    expect(csrf.request.method).toBe('GET');
    csrf.flush({ code: 200, data: {}, message: null, errorCode: null, retryable: null, traceId: null }, { headers: { [CSRF_HEADER]: 'fresh' } });
    expect(session.csrf()).toBe('fresh');
    ctrl.verify();
  });

  it('cancels a legacy CSRF refresh superseded by a newer realm session', async () => {
    const session = TestBed.inject(CustomerSession);
    session.setCsrf('stale');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(http.put('/api/v1/customer/me', {})).catch((err) => err);
    ctrl.expectOne('/api/v1/customer/me').flush(
      { errorCode: 'CSRF_INVALID' }, { status: 403, statusText: 'Forbidden' },
    );
    await pending;
    const refresh = ctrl.expectOne('/api/v1/customer/auth/csrf');
    TestBed.inject(AccessMutationFence).advance(AccessContext.Customer);
    expect(refresh.cancelled).toBe(true);
    expect(session.csrf()).toBe('');
    ctrl.verify();
  });

  it('does not apply a stale response token or 401 to a newer realm generation', async () => {
    const session = TestBed.inject(CustomerSession);
    session.commit({ email: 'new@example.test', firstName: 'N', lastName: 'U', phone: '' }, 'new-csrf');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(http.get('/api/v1/customer/me')).catch((err) => err);
    const request = ctrl.expectOne('/api/v1/customer/me');
    TestBed.inject(AccessMutationFence).advance(AccessContext.Customer);
    request.flush({ message: 'old session' }, { status: 401, statusText: 'Unauthorized', headers: { [CSRF_HEADER]: 'old-csrf' } });
    await pending;
    expect(session.authenticated()).toBe(true);
    expect(session.csrf()).toBe('new-csrf');
  });
});
