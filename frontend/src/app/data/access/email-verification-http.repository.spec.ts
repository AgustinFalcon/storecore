import { HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { EmailOwnership, VerificationOutcome as Outcome, VerificationRequestState as RequestState } from '../../domain/access/email-verification';
import { RecoveryRealm } from '../../domain/access/recovery';
import { EmailVerificationHttpRepository, mapVerificationLink, mapVerificationRequest } from './email-verification-http.repository';

const envelope = (kind: string, code = 200, extra = {}) => ({ code, data: { kind, ...extra } });
describe('email verification HTTP boundary', () => {
  let repository: EmailVerificationHttpRepository, ctrl: HttpTestingController;
  const url = (realm: RecoveryRealm) => `${environment.apiBaseUrl}/${realm.path}/auth/email-verification`;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), EmailVerificationHttpRepository] });
    repository = TestBed.inject(EmailVerificationHttpRepository); ctrl = TestBed.inject(HttpTestingController);
    TestBed.inject(CustomerSession).setCsrf('customer-before'); TestBed.inject(UserSession).setCsrf('user-before');
  });
  afterEach(() => ctrl.verify());
  it('uses authenticated exact realm GET state and strict fail-closed ownership translation', async () => {
    for (const realm of RecoveryRealm.all) for (const raw of ['VERIFIED', 'UNKNOWN', 'FUTURE']) {
      const pending = firstValueFrom(repository.ownership(realm));
      const request = ctrl.expectOne(url(realm)); expect(request.request.method).toBe('GET'); expect(request.request.withCredentials).toBe(true);
      request.flush({ code: 200, data: { ownership: raw } });
      expect(await pending).toBe(EmailOwnership.fromWire(raw));
    }
    const malformed = firstValueFrom(repository.ownership(RecoveryRealm.Customer)); ctrl.expectOne(url(RecoveryRealm.Customer)).flush({ ownership: 'VERIFIED' });
    expect(await malformed).toBe(EmailOwnership.Unknown);
    const unavailable = firstValueFrom(repository.ownership(RecoveryRealm.Customer));
    ctrl.expectOne(url(RecoveryRealm.Customer)).flush({ code: 503 }, { status: 503, statusText: 'Unavailable' });
    await expect(unavailable).rejects.toMatchObject({ status: 503 });
  });
  it('sends only the empty authenticated request with matching CSRF and rotates only that realm', async () => {
    for (const realm of RecoveryRealm.all) {
      const pending = firstValueFrom(repository.request(realm));
      const request = ctrl.expectOne(`${url(realm)}/requests`);
      expect(request.request.body).toEqual({}); expect(request.request.method).toBe('POST');
      expect(request.request.headers.get('X-CSRF-Token')).toBe(realm === RecoveryRealm.Customer ? 'customer-before' : 'user-before');
      request.flush(envelope(RequestState.Accepted.wire, 202, { cooldownSeconds: 60 }), { status: 202, statusText: 'Accepted', headers: new HttpHeaders({ 'X-CSRF-Token': `${realm.wire}-after` }) });
      expect(await pending).toEqual({ state: RequestState.Accepted, cooldownSeconds: 60 });
    }
    expect(TestBed.inject(CustomerSession).csrf()).toBe('customer-after'); expect(TestBed.inject(UserSession).csrf()).toBe('user-after');
  });
  it('never probes an unknown realm or sends malformed public secrets', async () => {
    expect(await firstValueFrom(repository.ownership(RecoveryRealm.Unknown))).toBe(EmailOwnership.Unknown);
    expect((await firstValueFrom(repository.request(RecoveryRealm.Unknown))).state).toBe(RequestState.Unknown);
    expect((await firstValueFrom(repository.inspect(RecoveryRealm.Unknown, 'a'.repeat(43)))).outcome).toBe(Outcome.Invalid);
    expect((await firstValueFrom(repository.complete(RecoveryRealm.Customer, 'bad'))).outcome).toBe(Outcome.Invalid);
    ctrl.expectNone(() => true);
  });
  it('isolates public inspection and completion from CSRF, session refresh and automatic retries', async () => {
    for (const realm of RecoveryRealm.all) {
      const inspect = firstValueFrom(repository.inspect(realm, 'a'.repeat(43)));
      const request = ctrl.expectOne(`${url(realm)}/inspect`);
      expect(request.request.body).toEqual({ token: 'a'.repeat(43) }); expect(request.request.headers.has('X-CSRF-Token')).toBe(false);
      request.flush(envelope(Outcome.Ready.wire, 200, { expiresAt: new Date(Date.now() + 60_000).toISOString() }), { headers: { 'X-CSRF-Token': 'ignored' } });
      expect((await inspect).outcome).toBe(Outcome.Ready);
      const complete = firstValueFrom(repository.complete(realm, 'a'.repeat(43)));
      const command = ctrl.expectOne(`${url(realm)}/complete`); expect(command.request.body).toEqual({ token: 'a'.repeat(43) }); expect(command.request.headers.has('X-CSRF-Token')).toBe(false);
      command.flush({ code: 403, errorCode: 'CSRF_INVALID' }, { status: 403, statusText: 'Forbidden' });
      expect((await complete).outcome).toBe(Outcome.Uncertain);
    }
    expect(TestBed.inject(CustomerSession).csrf()).toBe('customer-before'); expect(TestBed.inject(UserSession).csrf()).toBe('user-before');
    ctrl.expectNone(request => request.url.endsWith('/csrf'));
  });
  it('retains neutral rate-limit cooldown and unavailable results without claiming delivery', async () => {
    const pending = firstValueFrom(repository.request(RecoveryRealm.User));
    ctrl.expectOne(`${url(RecoveryRealm.User)}/requests`).flush({ code: 429, errorCode: RequestState.RateLimited.wire }, { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '120' } });
    expect(await pending).toEqual({ state: RequestState.RateLimited, cooldownSeconds: 120 });
    const unavailable = firstValueFrom(repository.request(RecoveryRealm.User));
    ctrl.expectOne(`${url(RecoveryRealm.User)}/requests`).flush({ code: 503 }, { status: 503, statusText: 'Unavailable' });
    expect((await unavailable).state).toBe(RequestState.Unavailable);
  });
  it('rejects cross-operation success vocabularies and malformed envelopes/cooldowns', () => {
    for (const raw of [null, {}, envelope('FUTURE'), envelope(Outcome.Verified.wire), envelope(Outcome.Ready.wire), envelope(Outcome.Ready.wire, 202, { expiresAt: new Date().toISOString() })]) expect(mapVerificationLink(raw, false).outcome).toBe(Outcome.Unknown);
    expect(mapVerificationLink(envelope(Outcome.Ready.wire, 200, { expiresAt: new Date().toISOString() }), true).outcome).toBe(Outcome.Unknown);
    expect(mapVerificationLink(envelope(Outcome.Verified.wire), true).outcome).toBe(Outcome.Verified);
    for (const raw of [null, envelope('FUTURE', 202), envelope(RequestState.Accepted.wire, 202), envelope(RequestState.Accepted.wire, 202, { cooldownSeconds: '60' }), envelope(RequestState.Accepted.wire, 202, { cooldownSeconds: -1 })]) expect(mapVerificationRequest(raw).state).toBe(RequestState.Unknown);
  });
});
