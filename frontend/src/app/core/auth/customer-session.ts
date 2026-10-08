import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { CustomerProfile } from '../../domain/customer/customer.entity';

import { CustomerSessionPort } from '../../domain/customer/customer-session.port';

@Injectable({ providedIn: 'root' })
export class CustomerSession implements CustomerSessionPort {
  private readonly signedIn = signal(false);
  private readonly transition = signal(false);
  readonly transitionPending = this.transition.asReadonly();
  private readonly csrfToken = signal('');
  private readonly identityGeneration = signal(0);
  private readonly actorChanges = new Subject<void>();
  readonly actorChanges$ = this.actorChanges.asObservable();
  private readonly actorEpoch = signal(0);
  private readonly principal = signal<CustomerProfile | null>(null);
  readonly actorId = computed(() => this.principal()?.id ?? null);
  readonly profile = this.principal.asReadonly();
  readonly authenticated = computed(() => this.signedIn());

  markAuthenticated(): void {
    this.principal.set(null);
    this.transition.set(false);
    this.actorChanges.next();
    this.actorEpoch.update(value => value + 1);
    this.identityGeneration.update((generation) => generation + 1);
    this.signedIn.set(true);
  }

  generation(): number {
    return this.identityGeneration();
  }

  actorRevision(): number { return this.actorEpoch(); }

  /** Cancel queued work while allowing the dispatched owner to finish token rotation. */
  invalidatePending(): void {
    this.transition.set(true);
    this.actorChanges.next();
    this.identityGeneration.update(value => value + 1);
    this.signedIn.set(false);
  }

  commit(principal: CustomerProfile, csrf: string): void {
    if (!principal.id || !csrf.trim()) { this.clear(); return; }
    if (this.actorId() !== principal.id) this.markAuthenticated();
    this.principal.set(principal);
    this.csrfToken.set(csrf.trim());
    this.signedIn.set(true);
    this.transition.set(false);
  }

  /** Drop display identity during replacement, retaining sent transport ownership. */
  discardSuspendedPrincipal(): void {
    if (this.transitionPending()) this.principal.set(null);
  }

  setCsrf(value: string): void {
    this.csrfToken.set(value.trim());
  }

  csrf(): string {
    return this.csrfToken();
  }

  clear(): void {
    this.transition.set(false);
    this.actorChanges.next();
    this.actorEpoch.update(value => value + 1);
    this.principal.set(null);
    this.identityGeneration.update((generation) => generation + 1);
    this.signedIn.set(false);
    this.csrfToken.set('');
  }
}
