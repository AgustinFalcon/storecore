import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, defer, mergeMap, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { requestPath } from '../api/request-path';
import { CSRF_HEADER } from './csrf';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';
import { CustomerMutationQueue, UserMutationQueue } from './session-mutation-queue';

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

function refreshCsrf(backend: HttpBackend, url: string, apply: (token: string) => void) {
  const http = new HttpClient(backend);
  return http.get(url, { observe: 'response', withCredentials: true }).pipe(
    tap((res) => {
      const token = res.headers.get(CSRF_HEADER);
      if (token) {
        apply(token);
      }
    }),
    catchError(() => of(null)),
  );
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const customer = inject(CustomerSession);
  const user = inject(UserSession);
  const backend = inject(HttpBackend);
  const internalMutations = inject(UserMutationQueue);
  const customerMutations = inject(CustomerMutationQueue);
  const path = requestPath(req.url);

  const dispatch = () => defer(() => {
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
        if (path.includes('/customer/')) {
          customer.setCsrf(csrf);
        }
        if (path.includes('/internal/') || path.includes('/user/')) {
          user.setCsrf(csrf);
        }
      }),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse) {
          if (err.status === 401) {
            if (path.includes('/customer/')) {
              customer.clear();
            }
            if (path.includes('/internal/') || path.includes('/user/')) {
              user.clear();
            }
          }
          if (err.status === 403 && errorCodeOf(err) === 'CSRF_INVALID' && !isCsrfProbe(path)) {
            if (path.includes('/customer/')) {
              customer.setCsrf('');
              return refreshCsrf(backend, `${environment.apiBaseUrl}/customer/auth/csrf`, (token) => customer.setCsrf(token))
                .pipe(mergeMap(() => throwError(() => err)));
            } else if (path.includes('/internal/') || path.includes('/user/')) {
              user.setCsrf('');
              // Keep the queue occupied until recovery completes; never replay the failed write.
              return refreshCsrf(backend, `${environment.apiBaseUrl}/internal/auth/csrf`, (token) => user.setCsrf(token))
                .pipe(mergeMap(() => throwError(() => err)));
            }
          }
        }
        return throwError(() => err);
      }),
    );
  });

  const internal = path.includes('/internal/') || path.includes('/user/');
  if (internal && ((isMutation(req.method) && !isInternalPublicAuth(path)) || isCsrfProbe(path))) {
    return internalMutations.enqueue(dispatch);
  }
  if (path.includes('/customer/') && ((isMutation(req.method) && !isCustomerPublicAuth(path)) || isCsrfProbe(path))) {
    return customerMutations.enqueue(dispatch);
  }
  return dispatch();
};
