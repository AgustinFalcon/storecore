import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, catchError, defer, finalize, forkJoin, map, Observable, of, ReplaySubject, share, shareReplay, switchMap, tap, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AccessContext } from '../../domain/access/access-context';
import { AccessState, ProbeOutcome, SessionProbe } from '../../domain/access/session-probe';
import { CustomerProfile } from '../../domain/customer/customer.entity';
import { UserSessionResult } from '../../domain/user/user.entity';
import { readApiBody } from '../api/base-response';
import { CSRF_HEADER } from './csrf';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';
import { AccessMutationFence } from './access-mutation-fence';
import { AccessSessionStaging } from './access-session-staging';
import { AccessInterlock } from './access-interlock';
import { AccessTransportCsrf } from './access-transport-csrf';
import { mapAccessPrincipal } from '../../data/mappers/access-session.mapper';

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
  private readonly revocations = new Map<AccessContext, Observable<void>>();
  private readonly pendingRevocations = new Set<AccessContext>();
  private readonly realmRevisions = new Map<AccessContext, number>();
  private customerProbe = SessionProbe.Unknown;
  private userProbe = SessionProbe.Unknown;
  private readonly accepted = signal(AccessState.Indeterminate);
  readonly state = this.accepted.asReadonly();
  private readonly stateChanges = new BehaviorSubject(AccessState.Indeterminate);
  readonly stateChanges$ = this.stateChanges.asObservable();

  constructor(
    backend: HttpBackend,
    private readonly customer: CustomerSession,
    private readonly user: UserSession,
    private readonly hint: ActiveContextHint,
    private readonly mutationFence: AccessMutationFence,
    private readonly staging: AccessSessionStaging,
    private readonly interlock: AccessInterlock,
    private readonly transportCsrf: AccessTransportCsrf,
  ) {
    // Staging must bypass the legacy interceptor's eager CSRF/401 session effects.
    this.http = new HttpClient(backend);
  }

  rehydrate(): Observable<AccessState> {
    if (this.flight) return this.flight;
    const generation = ++this.generation;
    for (const realm of [AccessContext.Customer, AccessContext.User]) {
      if (!this.pendingRevocations.has(realm)) this.mutationFence.advance(realm);
    }
    const flight: Observable<AccessState> = defer(() => {
      if (generation !== this.generation) return of(AccessState.Indeterminate);
      const customerRevision = this.revision(AccessContext.Customer);
      const userRevision = this.revision(AccessContext.User);
      const customerPending = this.pendingRevocations.has(AccessContext.Customer);
      const userPending = this.pendingRevocations.has(AccessContext.User);
      return forkJoin({
        customer: customerPending ? of(SessionProbe.Unknown) : this.probe(AccessContext.Customer),
        user: userPending ? of(SessionProbe.Unknown) : this.probe(AccessContext.User),
      }).pipe(map((results) => {
        if (generation !== this.generation) return AccessState.Indeterminate;
        if (!customerPending && customerRevision === this.revision(AccessContext.Customer)) {
          this.apply(AccessContext.Customer, results.customer);
          this.customerProbe = results.customer;
        }
        if (!userPending && userRevision === this.revision(AccessContext.User)) {
          this.apply(AccessContext.User, results.user);
          this.userProbe = results.user;
        }
        return this.publish();
      }));
    }).pipe(
      finalize(() => { if (this.flight === flight) this.flight = null; }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.flight = flight;
    return flight;
  }

  /** Call when a login starts, before its response may supersede a reload flight. */
  supersedeProbes(context: AccessContext = AccessContext.Unknown): void {
    ++this.generation;
    this.mutationFence.advance(context);
    this.flight = null;
  }

  /** Unified login has no principal: complete it with a fresh atomic realm probe. */
  acceptAuthenticated(context: AccessContext): Observable<AccessState> {
    if (!context.isKnown) return of(AccessState.Indeterminate);
    if (!this.mutationFence.permitsAuthentication(context)) {
      this.staging.clear(context);
      return of(AccessState.Indeterminate);
    }
    const stagedCsrf = this.staging.take(context);
    this.supersedeProbes(context);
    this.apply(context, SessionProbe.Anonymous);
    if (context === AccessContext.Customer) this.customerProbe = SessionProbe.Unknown;
    else this.userProbe = SessionProbe.Unknown;
    this.publish();
    if (!stagedCsrf) return of(AccessState.Indeterminate);
    const generation = this.generation;
    return defer(() => generation === this.generation ? this.probe(context) : of(SessionProbe.Unknown)).pipe(map((result) => {
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
    const session = context === AccessContext.Customer ? this.customer : this.user;
    if (!context.isKnown || !session.authenticated() || !session.csrf() || this.pendingRevocations.has(context)) return this.state();
    const next = this.state().select(context);
    if (next.activeContext === context) this.hint.write(context);
    this.accepted.set(next);
    this.stateChanges.next(next);
    return next;
  }

  logout(context: AccessContext = this.state().activeContext): Observable<void> {
    if (!context.isKnown) return of(undefined);
    const existing = this.revocations.get(context);
    if (existing) return existing;
    const flight: Observable<void> = defer(() => {
      const current = this.revocations.get(context);
      if (current && current !== flight) return current;
      this.revocations.set(context, flight);
      this.pendingRevocations.add(context);
      this.mutationFence.beginRevocation(context);
      this.staging.clear(context);
      this.supersedeProbes(context);
      const revision = this.revision(context) + 1;
      this.realmRevisions.set(context, revision);
      // Pending revoke removes authority, but retains CSRF until the server confirms it.
      if (context === AccessContext.Customer) this.customerProbe = SessionProbe.Unknown;
      else this.userProbe = SessionProbe.Unknown;
      this.publish();
      return this.interlock.run(context, () => this.http.post(`${environment.apiBaseUrl}/${this.realmPath(context)}/auth/logout`, {},
        { withCredentials: true, headers: { [CSRF_HEADER]: context === AccessContext.Customer ? this.customer.csrf() : this.user.csrf() } }).pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 401) return of(null);
          throw error;
        }),
        tap(() => {
          if (revision !== this.revision(context)) return;
          this.realmRevisions.set(context, revision + 1);
          this.apply(context, SessionProbe.Anonymous);
          if (context === AccessContext.Customer) this.customerProbe = SessionProbe.Anonymous;
          else this.userProbe = SessionProbe.Anonymous;
          if (this.hint.read() === context) this.hint.write(AccessContext.Unknown);
          this.publish();
        }), map(() => undefined),
      ));
    }).pipe(
      finalize(() => {
        if (this.revocations.get(context) === flight) {
          this.pendingRevocations.delete(context);
          this.mutationFence.endRevocation(context);
          this.revocations.delete(context);
        }
      }),
      // An old command replays its terminal result; retry requires a fresh logout command.
      share({ connector: () => new ReplaySubject<void>(1), resetOnError: false, resetOnComplete: false, resetOnRefCountZero: false }),
    );
    this.revocations.set(context, flight);
    return flight;
  }

  private revision(context: AccessContext): number { return this.realmRevisions.get(context) ?? 0; }

  private publish(): AccessState {
    const next = AccessState.resolve(this.customerProbe, this.userProbe, this.hint.read());
    this.accepted.set(next);
    this.stateChanges.next(next);
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
    return this.interlock.run(context, () => this.http.get<unknown>(`${base}/me`, { withCredentials: true }).pipe(
      map((body) => mapAccessPrincipal(context, readApiBody<unknown>(body))),
      switchMap((principal) => principal === null ? of(SessionProbe.Unknown)
        : this.http.get(`${base}/auth/csrf`, { withCredentials: true, observe: 'response' }).pipe(map((response) => {
          const body = readApiBody<unknown>(response.body);
          const csrf = response.headers.get(CSRF_HEADER)?.trim();
          this.transportCsrf.reconcile(context, csrf ?? null);
          if (!body || typeof body !== 'object' || Array.isArray(body)) return SessionProbe.Unknown;
          return csrf ? SessionProbe.authenticated(principal, csrf) : SessionProbe.Unknown;
        }))),
      timeout(10_000),
      catchError((error: unknown) => of(error instanceof HttpErrorResponse && error.status === 401 ? SessionProbe.Anonymous
        : error instanceof HttpErrorResponse && error.status > 0 && error.status < 500 ? SessionProbe.Unknown
        : error instanceof HttpErrorResponse || (error instanceof Error && error.name === 'TimeoutError') ? SessionProbe.Unavailable : SessionProbe.Unknown)),
    ));
  }

}
