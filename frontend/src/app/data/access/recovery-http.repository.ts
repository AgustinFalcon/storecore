import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { IRecoveryRepository, RecoveryOutcome as Outcome, RecoveryRealm, RecoveryResult } from '../../domain/access/recovery';

function row(raw: unknown): Record<string, unknown> | null { return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null; }
/** The only wire translator. Success vocabularies are scoped to each operation. */
export function mapRecoveryResponse(raw: unknown, status: number, allowed: readonly Outcome[]): RecoveryResult {
  const envelope = row(raw), data = row(envelope?.['data']);
  if (envelope?.['code'] !== status || !data) return { outcome: Outcome.Unknown };
  const outcome = Outcome.fromWire(data['kind']);
  if (!allowed.includes(outcome)) return { outcome: Outcome.Unknown };
  if (outcome === Outcome.Ready) {
    const rawExpiry = data['expiresAt'];
    const expiresAt = typeof rawExpiry === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(rawExpiry) ? Date.parse(rawExpiry) : NaN;
    return Number.isFinite(expiresAt) ? { outcome, expiresAt } : { outcome: Outcome.Unknown };
  }
  return { outcome };
}
export function mapRecoveryError(error: unknown, completion: boolean): RecoveryResult {
  if (!(error instanceof HttpErrorResponse)) return { outcome: completion ? Outcome.Uncertain : Outcome.Unavailable };
  const envelope = row(error.error);
  if (error.status === 429 && envelope?.['code'] === 429 && envelope['errorCode'] === 'RECOVERY_RATE_LIMITED') {
    const raw = error.headers.get('Retry-After');
    const retryAfter = raw && /^\d{1,5}$/.test(raw) ? Number(raw) : 0;
    return retryAfter > 0 && retryAfter <= 3600 ? { outcome: Outcome.RateLimited, retryAfter } : { outcome: Outcome.Unknown };
  }
  if (completion && error.status === 422 && envelope?.['code'] === 422 && envelope['errorCode'] === Outcome.PolicyViolation.wire) return { outcome: Outcome.PolicyViolation };
  if (error.status === 503 && envelope?.['code'] === 503 && envelope['errorCode'] === Outcome.Unavailable.wire) return { outcome: Outcome.Unavailable };
  if (error.status === 0 || error.status >= 500) return { outcome: completion ? Outcome.Uncertain : Outcome.Unavailable };
  return { outcome: Outcome.Unknown };
}

@Injectable()
export class RecoveryHttpRepository implements IRecoveryRepository {
  private readonly http: HttpClient;
  // Public recovery must not trigger auth-interceptor CSRF refresh, logout or retries.
  constructor(backend: HttpBackend) { this.http = new HttpClient(backend); }
  request(realm: RecoveryRealm, email: string): Observable<RecoveryResult> { return this.submit(realm, 'requests', { email }, 202, [Outcome.Accepted]); }
  inspect(realm: RecoveryRealm, token: string): Observable<RecoveryResult> { return this.submit(realm, 'inspect', { token }, 200, [Outcome.Ready, ...TERMINAL]); }
  complete(realm: RecoveryRealm, token: string, password: string): Observable<RecoveryResult> { return this.submit(realm, 'complete', { token, newPassword: password }, 200, [Outcome.Completed, ...TERMINAL], true); }
  private submit(realm: RecoveryRealm, operation: string, body: unknown, status: number, allowed: readonly Outcome[], completion = false): Observable<RecoveryResult> {
    if (realm === RecoveryRealm.Unknown) return of({ outcome: Outcome.Unknown });
    return this.http.post<unknown>(`${environment.apiBaseUrl}/${realm.path}/auth/recovery/${operation}`, body, { observe: 'response', withCredentials: true }).pipe(
      timeout(15_000), map(response => response.status === status ? mapRecoveryResponse(response.body, status, allowed) : { outcome: Outcome.Unknown }),
      catchError(error => of(mapRecoveryError(error, completion))),
    );
  }
}
const TERMINAL = [Outcome.Invalid, Outcome.Expired, Outcome.Used, Outcome.Superseded];
