import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, takeUntil, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { requestPath } from '../api/request-path';
import { CSRF_HEADER } from './csrf';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';
import { AccessContext } from '../../domain/access/access-context';
import { AccessMutationFence } from './access-mutation-fence';

function isMutation(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isCustomerPublicAuth(path: string): boolean {
  return path.endsWith('/customer/auth/login') || path.endsWith('/customer/auth/register');
}

function isInternalPublicAuth(path: string): boolean {
  return path.endsWith('/internal/auth/login');
}

function isCsrfProbe(path: string): boolean {
  return path.endsWith('/customer/auth/csrf') || path.endsWith('/internal/auth/csrf');
}

function errorCodeOf(err: HttpErrorResponse): string {
  const body = err.error as { errorCode?: string } | null;
  return body?.errorCode ?? '';
}

function refreshCsrf(
  backend: HttpBackend,
  url: string,
  context: AccessContext,
  fence: AccessMutationFence,
  apply: (token: string) => void,
): void {
  const http = new HttpClient(backend);
  const generation = fence.snapshot(context);
  http.get(url, { observe: 'response', withCredentials: true }).pipe(takeUntil(fence.cancellation(context))).subscribe({
    next: (res) => {
      const token = res.headers.get(CSRF_HEADER);
      if (token && fence.accepts(context, generation)) {
        apply(token);
      }
    },
    error: () => undefined,
  });
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const customer = inject(CustomerSession);
  const user = inject(UserSession);
  const backend = inject(HttpBackend);
  const fence = inject(AccessMutationFence);
  const path = requestPath(req.url);
  const context = path.includes('/customer/') ? AccessContext.Customer
    : path.includes('/internal/') || path.includes('/user/') ? AccessContext.User : AccessContext.Unknown;
  const generation = context.isKnown ? fence.snapshot(context) : -1;

  let outgoing = req.clone({ withCredentials: true });
  if (isMutation(outgoing.method) && !isCustomerPublicAuth(path) && !isInternalPublicAuth(path)) {
    if (path.includes('/customer/') && customer.csrf()) {
      outgoing = outgoing.clone({ setHeaders: { [CSRF_HEADER]: customer.csrf() } });
    } else if ((path.includes('/internal/') || path.includes('/user/')) && user.csrf()) {
      outgoing = outgoing.clone({ setHeaders: { [CSRF_HEADER]: user.csrf() } });
    }
  }

  return next(outgoing).pipe(
    tap((event) => {
      if (!(event instanceof HttpResponse)) {
        return;
      }
      const csrf = event.headers.get(CSRF_HEADER);
      if (!csrf) {
        return;
      }
      if (context === AccessContext.Customer && fence.accepts(context, generation)) {
        customer.setCsrf(csrf);
      }
      if (context === AccessContext.User && fence.accepts(context, generation)) {
        user.setCsrf(csrf);
      }
    }),
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401 && context.isKnown && fence.accepts(context, generation)) {
          if (context === AccessContext.Customer) {
            customer.clear();
          }
          if (context === AccessContext.User) {
            user.clear();
          }
        }
        if (err.status === 403 && errorCodeOf(err) === 'CSRF_INVALID' && !isCsrfProbe(path)
          && context.isKnown && fence.accepts(context, generation)) {
          if (context === AccessContext.Customer) {
            customer.setCsrf('');
            refreshCsrf(backend, `${environment.apiBaseUrl}/customer/auth/csrf`, AccessContext.Customer, fence, (token) => customer.setCsrf(token));
          } else if (context === AccessContext.User) {
            user.setCsrf('');
            refreshCsrf(backend, `${environment.apiBaseUrl}/internal/auth/csrf`, AccessContext.User, fence, (token) => user.setCsrf(token));
          }
        }
      }
      return throwError(() => err);
    }),
  );
};
