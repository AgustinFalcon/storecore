import { Injectable, computed, signal } from '@angular/core';
import { UserSessionPort } from '../../domain/user/user-session.port';
import { UserSessionResult } from '../../domain/user/user.entity';
import { UserRole } from '../../domain/user/user-role';

@Injectable({ providedIn: 'root' })
export class UserSession implements UserSessionPort {
  private readonly epochKey = 'sc:user-auth-epoch:v1';
  readonly authenticationEpoch = signal(this.readEpoch());
  private readonly state = signal<{ authenticated: boolean; principal: UserSessionResult | null; csrf: string }>({ authenticated: false, principal: null, csrf: '' });
  readonly authenticated = computed(() => this.state().authenticated);
  readonly principal = computed(() => this.state().principal);
  readonly roles = computed(() => this.state().principal?.roles ?? []);

  markAuthenticated(principal?: UserSessionResult): void {
    if (principal && this.principal() && JSON.stringify(this.knownPrincipal(principal)) !== JSON.stringify(this.principal())) this.rotateEpoch();
    this.state.update((state) => ({ ...state, authenticated: true, principal: principal ? this.knownPrincipal(principal) : state.principal }));
  }

  commit(principal: UserSessionResult, csrf: string): void {
    if (!UserRole.hasKnownRole(principal.roles) || !csrf.trim()) throw new Error('Sesión interna inválida.');
    if (this.principal() && JSON.stringify(this.knownPrincipal(principal)) !== JSON.stringify(this.principal())) this.rotateEpoch();
    this.state.set({ authenticated: true, principal: this.knownPrincipal(principal), csrf: csrf.trim() });
  }

  private knownPrincipal(principal: UserSessionResult): UserSessionResult {
    return { id: principal.id, roles: principal.roles.filter((role) => role.isKnown).sort((left, right) => left.wire.localeCompare(right.wire)) };
  }

  setCsrf(value: string): void {
    this.state.update((state) => ({ ...state, csrf: value.trim() }));
  }

  csrf(): string {
    return this.state().csrf;
  }
  beginAuthenticationEpoch(): void { this.rotateEpoch(); }

  clear(): void {
    this.rotateEpoch();
    this.state.set({ authenticated: false, principal: null, csrf: '' });
  }
  private readEpoch(): string {
    try { const existing = sessionStorage.getItem(this.epochKey); if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing; } catch { /* Storage is optional for read-only sessions. */ }
    const epoch = crypto.randomUUID();
    try { sessionStorage.setItem(this.epochKey, epoch); } catch { /* Adjustment journal fails closed independently. */ }
    return epoch;
  }
  private rotateEpoch(): void {
    const epoch = crypto.randomUUID(); this.authenticationEpoch.set(epoch);
    try { sessionStorage.setItem(this.epochKey, epoch); } catch { /* Adjustment journal fails closed independently. */ }
  }
}
