import { Injectable, computed, signal } from '@angular/core';
import { UserSessionPort } from '../../domain/user/user-session.port';
import { UserSessionResult } from '../../domain/user/user.entity';
import { UserRole } from '../../domain/user/user-role';

@Injectable({ providedIn: 'root' })
export class UserSession implements UserSessionPort {
  private readonly state = signal<{ authenticated: boolean; principal: UserSessionResult | null; csrf: string }>({ authenticated: false, principal: null, csrf: '' });
  readonly authenticated = computed(() => this.state().authenticated);
  readonly principal = computed(() => this.state().principal);
  readonly roles = computed(() => this.state().principal?.roles ?? []);

  markAuthenticated(principal?: UserSessionResult): void {
    this.state.update((state) => ({ ...state, authenticated: true, principal: principal ? this.knownPrincipal(principal) : state.principal }));
  }

  commit(principal: UserSessionResult, csrf: string): void {
    if (!UserRole.hasKnownRole(principal.roles) || !csrf.trim()) throw new Error('Sesión interna inválida.');
    this.state.set({ authenticated: true, principal: this.knownPrincipal(principal), csrf: csrf.trim() });
  }

  private knownPrincipal(principal: UserSessionResult): UserSessionResult {
    return { id: principal.id, roles: principal.roles.filter((role) => role.isKnown) };
  }

  setCsrf(value: string): void {
    this.state.update((state) => ({ ...state, csrf: value.trim() }));
  }

  csrf(): string {
    return this.state().csrf;
  }

  clear(): void {
    this.state.set({ authenticated: false, principal: null, csrf: '' });
  }
}
