import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { CSRF_HEADER } from './csrf';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';

describe('authInterceptor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
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
    const csrf = ctrl.expectOne('/api/v1/customer/auth/csrf');
    expect(csrf.request.method).toBe('GET');
    csrf.flush({ code: 200, data: {}, message: null, errorCode: null, retryable: null, traceId: null }, { headers: { [CSRF_HEADER]: 'fresh' } });
    await pending;
    expect(session.csrf()).toBe('fresh');
    ctrl.verify();
  });

  it('serializes USER writes across endpoints and reads the rotated token at dispatch', async () => {
    const session = TestBed.inject(UserSession);
    session.setCsrf('initial');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const first = firstValueFrom(http.post('/api/v1/user/orders/A/shipments', {}));
    const second = firstValueFrom(http.post('/api/v1/user/orders/B/rma', {}));
    const write = ctrl.expectOne('/api/v1/user/orders/A/shipments');
    expect(write.request.headers.get(CSRF_HEADER)).toBe('initial');
    ctrl.expectNone('/api/v1/user/orders/B/rma');
    write.flush({}, { headers: { [CSRF_HEADER]: 'rotated' } });
    const next = ctrl.expectOne('/api/v1/user/orders/B/rma');
    expect(next.request.headers.get(CSRF_HEADER)).toBe('rotated');
    next.flush({});
    await Promise.all([first, second]);
    ctrl.verify();
  });

  it('serializes CUSTOMER writes and reads their own rotated token at dispatch', async () => {
    TestBed.inject(CustomerSession).setCsrf('customer-initial');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const first = firstValueFrom(http.put('/api/v1/customer/me', {}));
    const second = firstValueFrom(http.post('/api/v1/customer/me/addresses', {}));
    ctrl.expectNone('/api/v1/customer/me/addresses');
    ctrl.expectOne('/api/v1/customer/me').flush({}, { headers: { [CSRF_HEADER]: 'customer-next' } });
    const next = ctrl.expectOne('/api/v1/customer/me/addresses');
    expect(next.request.headers.get(CSRF_HEADER)).toBe('customer-next');
    next.flush({});
    await Promise.all([first, second]);
    ctrl.verify();
  });

  it('does not poison the USER queue after a write fails', async () => {
    TestBed.inject(UserSession).setCsrf('initial');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const first = firstValueFrom(http.post('/api/v1/user/promos', {})).catch((error: unknown) => error);
    const second = firstValueFrom(http.post('/api/v1/user/orders/B/rma', {}));
    ctrl.expectOne('/api/v1/user/promos').flush({}, { status: 500, statusText: 'Failure' });
    ctrl.expectOne('/api/v1/user/orders/B/rma').flush({});
    await Promise.all([first, second]);
    const third = firstValueFrom(http.post('/api/v1/user/promos', {}));
    ctrl.expectOne('/api/v1/user/promos').flush({});
    await third;
    ctrl.verify();
  });

  it('holds queued USER writes until CSRF recovery finishes without replaying the failed write', async () => {
    const session = TestBed.inject(UserSession);
    session.setCsrf('stale');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const first = firstValueFrom(http.post('/api/v1/user/promos', {})).catch((error: unknown) => error);
    const second = firstValueFrom(http.post('/api/v1/user/orders/B/rma', {}));
    ctrl.expectOne('/api/v1/user/promos').flush({ errorCode: 'CSRF_INVALID' }, { status: 403, statusText: 'Forbidden' });
    ctrl.expectNone('/api/v1/user/orders/B/rma');
    ctrl.expectOne('/api/v1/internal/auth/csrf').flush({}, { headers: { [CSRF_HEADER]: 'recovered' } });
    const next = ctrl.expectOne('/api/v1/user/orders/B/rma');
    expect(next.request.headers.get(CSRF_HEADER)).toBe('recovered');
    next.flush({});
    await Promise.all([first, second]);
    ctrl.expectNone('/api/v1/user/promos');
    ctrl.verify();
  });

  it('retains dispatched USER writes after view cancellation and skips cancelled queued requests', () => {
    const session = TestBed.inject(UserSession);
    session.setCsrf('initial');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const active = http.post('/api/v1/user/orders/A/shipments', {}).subscribe();
    const cancelled = http.post('/api/v1/user/promos', {}).subscribe();
    cancelled.unsubscribe();
    active.unsubscribe();
    const write = ctrl.expectOne('/api/v1/user/orders/A/shipments');
    expect(write.cancelled).toBe(false);
    write.flush({}, { headers: { [CSRF_HEADER]: 'rotated' } });
    ctrl.expectNone('/api/v1/user/promos');
    expect(session.csrf()).toBe('rotated');
    ctrl.verify();
  });

  it('serializes USER CSRF probes but lets CUSTOMER writes proceed independently', async () => {
    TestBed.inject(UserSession).setCsrf('initial');
    TestBed.inject(CustomerSession).setCsrf('customer');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const first = firstValueFrom(http.post('/api/v1/user/promos', {}));
    const probe = firstValueFrom(http.get('/api/v1/internal/auth/csrf'));
    const customer = firstValueFrom(http.put('/api/v1/customer/me', {}));
    ctrl.expectNone('/api/v1/internal/auth/csrf');
    const customerWrite = ctrl.expectOne('/api/v1/customer/me');
    expect(customerWrite.request.headers.get(CSRF_HEADER)).toBe('customer');
    customerWrite.flush({});
    ctrl.expectOne('/api/v1/user/promos').flush({}, { headers: { [CSRF_HEADER]: 'rotated' } });
    ctrl.expectOne('/api/v1/internal/auth/csrf').flush({}, { headers: { [CSRF_HEADER]: 'probe' } });
    await Promise.all([first, probe, customer]);
    ctrl.verify();
  });

  it('invalidates queued CUSTOMER writes and stale CSRF responses after an identity change', async () => {
    const session = TestBed.inject(CustomerSession);
    session.setCsrf('csrf-a');
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const active = firstValueFrom(http.put('/api/v1/customer/me', { name: 'A' }));
    const queued = firstValueFrom(http.post('/api/v1/customer/me/addresses', { street: 'A' }))
      .catch((error: unknown) => error);
    const login = firstValueFrom(http.post('/api/v1/customer/auth/login', {}));
    const activeRequest = ctrl.expectOne('/api/v1/customer/me');
    ctrl.expectOne('/api/v1/customer/auth/login').flush({ id: 'customer-b' });
    await login;
    session.markAuthenticated();
    session.setCsrf('csrf-b');

    ctrl.expectNone('/api/v1/customer/me/addresses');
    activeRequest.flush({}, { headers: { [CSRF_HEADER]: 'stale-a' } });
    const [, queuedResult] = await Promise.all([active, queued]);
    expect(queuedResult).toEqual(expect.objectContaining({ name: 'SessionMutationCancelledError' }));
    expect(session.csrf()).toBe('csrf-b');
    ctrl.expectNone('/api/v1/customer/me/addresses');
    ctrl.verify();
  });
});
