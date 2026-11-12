import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EmailOwnership, IEmailVerificationRepository, VerificationLinkResult, VerificationOutcome as Outcome, VerificationRequestResult, VerificationRequestState as RequestState } from '../../domain/access/email-verification';
import { RecoveryRealm } from '../../domain/access/recovery';

function row(raw: unknown): Record<string, unknown> | null { return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null; }
function data(raw: unknown, status: number): Record<string, unknown> | null { const envelope = row(raw); return envelope?.['code'] === status ? row(envelope['data']) : null; }
export function mapVerificationRequest(raw: unknown): VerificationRequestResult {
  const body = data(raw, 202), state = RequestState.fromWire(body?.['kind']);
  return state === RequestState.Accepted && body?.['cooldownSeconds'] === 60 ? { state, cooldownSeconds: 60 } : { state: RequestState.Unknown };
}
export function mapVerificationLink(raw: unknown, completing: boolean): VerificationLinkResult {
  const body = data(raw, 200), outcome = Outcome.fromWire(body?.['kind']);
  const allowed = completing ? [Outcome.Verified, ...TERMINAL] : [Outcome.Ready, ...TERMINAL];
  if (!allowed.includes(outcome)) return { outcome: Outcome.Unknown };
  if (outcome !== Outcome.Ready) return { outcome };
  const expiry = body?.['expiresAt'];
  const expiresAt = typeof expiry === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(expiry) ? Date.parse(expiry) : NaN;
  return Number.isFinite(expiresAt) ? { outcome, expiresAt } : { outcome: Outcome.Unknown };
}
function errorState(error: unknown): VerificationRequestResult {
  if (error instanceof HttpErrorResponse) {
    const envelope = row(error.error);
    if (error.status === 429 && envelope?.['code'] === 429 && RequestState.fromWire(envelope['errorCode']) === RequestState.RateLimited) {
      const raw = error.headers.get('Retry-After');
      const seconds = raw && /^\d{1,5}$/.test(raw) ? Number(raw) : 0;
      return seconds > 0 && seconds <= 3600 ? { state: RequestState.RateLimited, cooldownSeconds: seconds } : { state: RequestState.Unknown };
    }
    if (error.status > 0 && error.status < 500) return { state: RequestState.Unknown };
  }
  return { state: RequestState.Unavailable };
}
const TERMINAL = [Outcome.Invalid, Outcome.Expired, Outcome.Used, Outcome.Superseded];

@Injectable()
export class EmailVerificationHttpRepository implements IEmailVerificationRepository {
  private readonly publicHttp: HttpClient;
  constructor(private readonly http: HttpClient, backend: HttpBackend) { this.publicHttp = new HttpClient(backend); }
  ownership(realm: RecoveryRealm): Observable<EmailOwnership> {
    if (realm === RecoveryRealm.Unknown) return of(EmailOwnership.Unknown);
    return this.http.get<unknown>(this.url(realm), { observe: 'response', withCredentials: true }).pipe(timeout(15_000),
      map(response => EmailOwnership.fromWire(response.status === 200 ? data(response.body, 200)?.['ownership'] : null)));
  }
  request(realm: RecoveryRealm): Observable<VerificationRequestResult> {
    if (realm === RecoveryRealm.Unknown) return of({ state: RequestState.Unknown });
    // Authenticated mutation uses the normal interceptor for realm CSRF and rotation.
    return this.http.post<unknown>(`${this.url(realm)}/requests`, {}, { observe: 'response', withCredentials: true }).pipe(timeout(15_000),
      map(response => response.status === 202 ? mapVerificationRequest(response.body) : { state: RequestState.Unknown }), catchError(error => of(errorState(error))));
  }
  inspect(realm: RecoveryRealm, token: string): Observable<VerificationLinkResult> { return this.link(realm, token, false); }
  complete(realm: RecoveryRealm, token: string): Observable<VerificationLinkResult> { return this.link(realm, token, true); }
  private link(realm: RecoveryRealm, token: string, completing: boolean): Observable<VerificationLinkResult> {
    if (realm === RecoveryRealm.Unknown || token.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(token)) return of({ outcome: Outcome.Invalid });
    // Public token operations must never refresh CSRF, retry or clear a session.
    return this.publicHttp.post<unknown>(`${this.url(realm)}/${completing ? 'complete' : 'inspect'}`, { token }, { observe: 'response', withCredentials: true }).pipe(timeout(15_000),
      map(response => response.status === 200 ? mapVerificationLink(response.body, completing) : { outcome: Outcome.Unknown }),
      catchError(error => {
        const failure = errorState(error);
        return of({ outcome: failure.state === RequestState.RateLimited ? Outcome.RateLimited : completing ? Outcome.Uncertain : Outcome.Unavailable });
      }));
  }
  private url(realm: RecoveryRealm): string { return `${environment.apiBaseUrl}/${realm.path}/auth/email-verification`; }
}
