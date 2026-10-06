import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { catchError, defer, finalize, forkJoin, map, Observable, of, shareReplay, switchMap, tap, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AccessContext } from '../../domain/access/access-context';
import { AccessState, ProbeOutcome, SessionProbe } from '../../domain/access/session-probe';
import { CustomerProfile } from '../../domain/customer/customer.entity';
import { UserRole } from '../../domain/user/user-role';
import { UserSessionResult } from '../../domain/user/user.entity';
import { readApiBody } from '../api/base-response';
import { CSRF_HEADER } from './csrf';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';
import { AccessMutationFence } from './access-mutation-fence';

/** A browser hint is navigation preference only. No identity or secrets are persisted. */
@Injectable({ providedIn: 'root' })
export class ActiveContextHint {
  private readonly key = 'storecore.active-context';
  read(): AccessContext {
    try { return AccessContext.fromWire(globalThis.localStorage?.getItem(this.key)); } catch { return AccessContext.Unknown; }
  }
  write(context: AccessContext): void {
    try {
      if (context.isKnown) globalThis.localStorage?.setItem(this.key, context.wire);
      else globalThis.localStorage?.removeItem(this.key);
    } catch { /* Storage is optional; it never authorizes. */ }
  }
}

@Injectable({ providedIn: 'root' })
export class AccessCoordinator {
  private readonly http: HttpClient;
  private generation = 0;
  private flight: Observable<AccessState> | null = null;
  private customerProbe = SessionProbe.Unknown;
  private userProbe = SessionProbe.Unknown;
  private readonly accepted = signal(AccessState.Indeterminate);
  readonly state = this.accepted.asReadonly();

  constructor(
    backend: HttpBackend,
    private readonly customer: CustomerSession,
    private readonly user: UserSession,
    private readonly hint: ActiveContextHint,
    private readonly mutationFence: AccessMutationFence,
  ) {
    // Staging must bypass the legacy interceptor's eager CSRF/401 session effects.
    this.http = new HttpClient(backend);
  }

  rehydrate(): Observable<AccessState> {
    if (this.flight) return this.flight;
    const generation = ++this.generation;
    this.mutationFence.advance();
    const flight = defer(() => forkJoin({ customer: this.probe(AccessContext.Customer), user: this.probe(AccessContext.User) })).pipe(
      map((results) => {
        if (generation !== this.generation) return AccessState.Indeterminate;
        this.apply(AccessContext.Customer, results.customer);
        this.apply(AccessContext.User, results.user);
        this.customerProbe = results.customer;
        this.userProbe = results.user;
        return this.publish();
      }),
      finalize(() => { if (this.flight === flight) this.flight = null; }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.flight = flight;
    return flight;
  }

  /** Call when a login starts, before its response may supersede a reload flight. */
  supersedeProbes(): void {
    ++this.generation;
    this.mutationFence.advance();
    this.flight = null;
  }

  /** Unified login has no principal: complete it with a fresh atomic realm probe. */
  acceptAuthenticated(context: AccessContext): Observable<AccessState> {
    this.supersedeProbes();
    if (!context.isKnown) return of(AccessState.Indeterminate);
    const generation = this.generation;
    return this.probe(context).pipe(map((result) => {
      if (generation !== this.generation) return AccessState.Indeterminate;
      this.apply(context, result);
      if (context === AccessContext.Customer) this.customerProbe = result;
      else this.userProbe = result;
      if (result.outcome === ProbeOutcome.Authenticated) this.hint.write(context);
      return this.publish();
    }));
  }

  /** Choosing between already accepted sessions is local; no challenge POST. */
  selectContext(context: AccessContext): AccessState {
    const next = this.state().select(context);
    if (next.activeContext === context) this.hint.write(context);
    this.accepted.set(next);
    return next;
  }

  logout(context: AccessContext = this.state().activeContext): Observable<void> {
    if (!context.isKnown) return of(undefined);
    this.supersedeProbes();
    const generation = this.generation;
    const csrf = context === AccessContext.Customer ? this.customer.csrf() : this.user.csrf();
    return this.http.post(`${environment.apiBaseUrl}/${this.realmPath(context)}/auth/logout`, {},
      { withCredentials: true, headers: { [CSRF_HEADER]: csrf } }).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) return of(null);
        throw error;
      }),
      tap(() => {
        if (generation !== this.generation) return;
        this.apply(context, SessionProbe.Anonymous);
        if (context === AccessContext.Customer) this.customerProbe = SessionProbe.Anonymous;
        else this.userProbe = SessionProbe.Anonymous;
        if (this.hint.read() === context) this.hint.write(AccessContext.Unknown);
        this.publish();
      }), map(() => undefined),
    );
  }

  private publish(): AccessState {
    const next = AccessState.resolve(this.customerProbe, this.userProbe, this.hint.read());
    this.accepted.set(next);
    return next;
  }

  private apply(context: AccessContext, probe: SessionProbe): void {
    if (probe.outcome === ProbeOutcome.Authenticated && probe.principal) {
      if (context === AccessContext.Customer) this.customer.commit(probe.principal as CustomerProfile, probe.csrf);
      else this.user.commit(probe.principal as UserSessionResult, probe.csrf);
    } else if (probe.outcome === ProbeOutcome.Anonymous) {
      if (context === AccessContext.Customer) this.customer.clear(); else this.user.clear();
    }
  }

  private realmPath(context: AccessContext): string { return context === AccessContext.Customer ? 'customer' : 'internal'; }

  private probe(context: AccessContext): Observable<SessionProbe> {
    const base = `${environment.apiBaseUrl}/${this.realmPath(context)}`;
    return this.http.get<unknown>(`${base}/me`, { withCredentials: true }).pipe(
      map((body) => this.principal(context, readApiBody<unknown>(body))),
      switchMap((principal) => principal === null ? of(SessionProbe.Unknown)
        : this.http.get(`${base}/auth/csrf`, { withCredentials: true, observe: 'response' }).pipe(map((response) => {
          const body = readApiBody<unknown>(response.body);
          if (!body || typeof body !== 'object' || Array.isArray(body)) return SessionProbe.Unknown;
          const csrf = response.headers.get(CSRF_HEADER)?.trim();
          return csrf ? SessionProbe.authenticated(principal, csrf) : SessionProbe.Unknown;
        }))),
      timeout(10_000),
      catchError((error: unknown) => of(error instanceof HttpErrorResponse && error.status === 401 ? SessionProbe.Anonymous
        : error instanceof HttpErrorResponse && error.status > 0 && error.status < 500 ? SessionProbe.Unknown
        : error instanceof HttpErrorResponse || (error instanceof Error && error.name === 'TimeoutError') ? SessionProbe.Unavailable : SessionProbe.Unknown)),
    );
  }

  private principal(context: AccessContext, raw: unknown): CustomerProfile | UserSessionResult | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    if (context === AccessContext.Customer) {
      if (typeof row['email'] !== 'string' || !row['email'].trim() || typeof row['firstName'] !== 'string'
        || typeof row['lastName'] !== 'string' || (row['phone'] != null && typeof row['phone'] !== 'string')) return null;
      const id = this.subjectId(row['id']);
      return { ...(id ? { id } : {}), email: row['email'], firstName: row['firstName'], lastName: row['lastName'], phone: (row['phone'] as string | null | undefined) ?? '' };
    }
    const id = this.subjectId(row['id']);
    if (!id || !Array.isArray(row['roles'])) return null;
    const roles = row['roles'].map(UserRole.fromWire).filter((role) => role.isKnown);
    return UserRole.hasKnownRole(roles) ? { id, roles } : null;
  }

  private subjectId(raw: unknown): string | null {
    return typeof raw === 'string' && raw.trim() ? raw
      : typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0 ? String(raw) : null;
  }
}
