import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CSRF_HEADER } from '../../core/auth/csrf';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { AccessMutationFence } from '../../core/auth/access-mutation-fence';
import { AccessContext } from '../../domain/access/access-context';
import { AccessCredentials, IAccessRepository } from '../../domain/access/access.repository';
import { LoginResolution, LoginResult } from '../../domain/access/login-resolution';
import { mapAccessResponse } from '../mappers/access-http.mapper';

@Injectable()
export class AccessHttpRepository implements IAccessRepository {
  constructor(
    private readonly http: HttpClient,
    private readonly customer: CustomerSession,
    private readonly user: UserSession,
    private readonly mutationFence: AccessMutationFence,
  ) {}
  signIn(credentials: AccessCredentials): Observable<LoginResult> {
    return this.submit('/auth/login', { email: credentials.email, password: credentials.password, ...(credentials.returnPath === undefined ? {} : { returnPath: credentials.returnPath }) });
  }
  selectContext(challenge: string, context: AccessContext): Observable<LoginResult> {
    if (!context.isKnown) return of(LoginResult.Unknown);
    return this.submit('/auth/context-selection', { challenge, context: context.wire }, context);
  }
  private submit(path: string, body: unknown, selectedContext?: AccessContext): Observable<LoginResult> {
    const generation = this.mutationFence.snapshot();
    return this.http.post<unknown>(`${environment.apiBaseUrl}${path}`, body, { observe: 'response', withCredentials: true }).pipe(
      map((response) => {
        if (!this.mutationFence.accepts(generation)) return LoginResult.Unknown;
        const result = mapAccessResponse(response.body);
        if (selectedContext && (result.resolution !== LoginResolution.Authenticated || result.context !== selectedContext)) return LoginResult.Unknown;
        if (result.resolution === LoginResolution.Authenticated) {
          const csrf = response.headers.get(CSRF_HEADER)?.trim();
          if (!csrf) return LoginResult.Unknown;
          const session = result.context === AccessContext.Customer ? this.customer : this.user;
          session.setCsrf(csrf);
        }
        return result;
      }),
      catchError((error: unknown) => of(error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500 ? LoginResult.Rejected : LoginResult.Unavailable)),
    );
  }
}
