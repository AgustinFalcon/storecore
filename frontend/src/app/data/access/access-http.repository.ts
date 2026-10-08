import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { CSRF_HEADER } from '../../core/auth/csrf';
import { AccessSessionIssuer } from '../../core/auth/access-session-issuer';
import { AccessCredentials, AccessRepository } from '../../domain/access/access.repository';
import { IdentityRealm, LoginResolution, LoginResolutionKind } from '../../domain/access/access.types';

@Injectable()
export class AccessHttpRepository implements AccessRepository {
  constructor(private readonly http: HttpClient, private readonly sessions: AccessSessionIssuer) {}
  authenticate(credentials: AccessCredentials): Observable<LoginResolution> { return this.post('login', credentials); }
  select(challenge: string, realm: IdentityRealm): Observable<LoginResolution> {
    if (!realm.known) return of(LoginResolution.Unknown);
    return this.post('context-selection', { challenge, context: realm.wire }, realm);
  }
  private post(path: string, body: object, selectedRealm?: IdentityRealm): Observable<LoginResolution> {
    return this.http.post<unknown>(`${environment.apiBaseUrl}/auth/${path}`, body, { observe: 'response', withCredentials: true }).pipe(
      map(response => {
        const resolution = LoginResolution.fromWire(readApiBody<unknown>(response.body));
        if (selectedRealm && (resolution.kind !== LoginResolutionKind.Authenticated || resolution.realm !== selectedRealm)) return LoginResolution.Unknown;
        return this.sessions.issue(resolution, response.headers.get(CSRF_HEADER));
      }),
      catchError((error: unknown) => error instanceof HttpErrorResponse && [401, 403, 429].includes(error.status)
        ? of(LoginResolution.Rejected) : throwError(() => new Error('Access request failed'))),
    );
  }
}
