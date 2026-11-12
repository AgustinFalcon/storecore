import { HttpClient, HttpErrorResponse, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { RecoveryOutcome as Outcome, RecoveryRealm } from '../../domain/access/recovery';
import { mapRecoveryError, mapRecoveryResponse, RecoveryHttpRepository } from './recovery-http.repository';

const envelope = (kind: string, code = 200, extra = {}) => ({ code, data: { kind, ...extra }, errorCode: null });
describe('strict recovery wire translation', () => {
  it('requires approved envelopes, operation outcome and READY expiry', () => {
    expect(mapRecoveryResponse(envelope(Outcome.Accepted.wire, 202), 202, [Outcome.Accepted]).outcome).toBe(Outcome.Accepted);
    for (const raw of [null, { kind: Outcome.Accepted.wire }, envelope('FUTURE'), envelope(Outcome.Accepted.wire, 200), { code: 202, data: [] }]) expect(mapRecoveryResponse(raw, 202, [Outcome.Accepted]).outcome).toBe(Outcome.Unknown);
    expect(mapRecoveryResponse(envelope(Outcome.Ready.wire), 200, [Outcome.Ready]).outcome).toBe(Outcome.Unknown);
    expect(mapRecoveryResponse(envelope(Outcome.Ready.wire, 200, { expiresAt: new Date().toISOString() }), 200, [Outcome.Ready]).outcome).toBe(Outcome.Ready);
    expect(mapRecoveryResponse(envelope(Outcome.Completed.wire), 200, [Outcome.Ready]).outcome).toBe(Outcome.Unknown);
  });
  it('validates rate-limit headers and makes lost completion uncertain', () => {
    const limited = (retry: string) => new HttpErrorResponse({ status: 429, error: { code: 429, errorCode: Outcome.RateLimited.wire }, headers: new HttpHeaders({ 'Retry-After': retry }) });
    expect(mapRecoveryError(limited('15'), false)).toEqual({ outcome: Outcome.RateLimited, retryAfter: 15 });
    for (const retry of ['-1', '0', 'forever', '999999999']) expect(mapRecoveryError(limited(retry), false).outcome).toBe(Outcome.Unknown);
    expect(mapRecoveryError(new HttpErrorResponse({ status: 0 }), true).outcome).toBe(Outcome.Uncertain);
    expect(mapRecoveryError(new Error('timeout'), true).outcome).toBe(Outcome.Uncertain);
    expect(mapRecoveryError(new HttpErrorResponse({ status: 503, error: { code: 503, errorCode: Outcome.Unavailable.wire } }), false).outcome).toBe(Outcome.Unavailable);
  });
});
describe('public recovery HTTP boundary', () => {
  let repository: RecoveryHttpRepository, ctrl: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), RecoveryHttpRepository] });
    repository = TestBed.inject(RecoveryHttpRepository); ctrl = TestBed.inject(HttpTestingController);
    TestBed.inject(CustomerSession).setCsrf('customer-before'); TestBed.inject(UserSession).setCsrf('user-before');
  });
  afterEach(() => ctrl.verify());
  it('uses exact realm endpoints and bodies, cookies and no CSRF; unknown never probes', async () => {
    expect((await firstValueFrom(repository.inspect(RecoveryRealm.Unknown, 'secret'))).outcome).toBe(Outcome.Unknown);
    for (const realm of RecoveryRealm.all) {
      const pending = firstValueFrom(repository.request(realm, 'person@example.test'));
      const request = ctrl.expectOne(`${environment.apiBaseUrl}/${realm.path}/auth/recovery/requests`);
      expect(request.request.body).toEqual({ email: 'person@example.test' });
      expect(request.request.withCredentials).toBe(true); expect(request.request.headers.has('X-CSRF-Token')).toBe(false);
      request.flush(envelope(Outcome.Accepted.wire, 202), { status: 202, statusText: 'Accepted' });
      expect((await pending).outcome).toBe(Outcome.Accepted);
    }
  });
  it('403 recovery through the normal interceptor does not refresh, clear or rotate either realm', async () => {
    const http = TestBed.inject(HttpClient);
    for (const realm of RecoveryRealm.all) for (const operation of ['requests', 'inspect', 'complete']) {
      const path = `${environment.apiBaseUrl}/${realm.path}/auth/recovery/${operation}`;
      const pending = firstValueFrom(http.post(path, {})).catch(() => undefined);
      const request = ctrl.expectOne(path); expect(request.request.headers.has('X-CSRF-Token')).toBe(false);
      request.flush({ errorCode: 'CSRF_INVALID' }, { status: 403, statusText: 'Forbidden' }); await pending;
    }
    expect(TestBed.inject(CustomerSession).csrf()).toBe('customer-before'); expect(TestBed.inject(UserSession).csrf()).toBe('user-before');
  });
  it('preserves the complete command without retry after a lost response', async () => {
    const pending = firstValueFrom(repository.complete(RecoveryRealm.User, 'opaque-secret', '😀'.repeat(12)));
    const request = ctrl.expectOne(`${environment.apiBaseUrl}/internal/auth/recovery/complete`);
    expect(request.request.body).toEqual({ token: 'opaque-secret', newPassword: '😀'.repeat(12) });
    request.error(new ProgressEvent('error'));
    expect((await pending).outcome).toBe(Outcome.Uncertain);
  });
});
