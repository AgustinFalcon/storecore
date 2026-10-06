import { Injectable, computed, signal } from '@angular/core';
import { CustomerSessionPort } from '../../domain/customer/customer-session.port';
import { CustomerProfile, CustomerSessionResult } from '../../domain/customer/customer.entity';

@Injectable({ providedIn: 'root' })
export class CustomerSession implements CustomerSessionPort {
  private readonly state = signal<{ authenticated: boolean; principal: CustomerProfile | CustomerSessionResult | null; csrf: string }>({ authenticated: false, principal: null, csrf: '' });
  readonly authenticated = computed(() => this.state().authenticated);
  readonly principal = computed(() => this.state().principal);

  markAuthenticated(principal?: CustomerProfile | CustomerSessionResult): void {
    this.state.update((state) => ({ ...state, authenticated: true, principal: principal ?? state.principal }));
  }

  commit(principal: CustomerProfile, csrf: string): void {
    if (!csrf.trim()) throw new Error('CSRF requerido.');
    this.state.set({ authenticated: true, principal: { ...principal }, csrf: csrf.trim() });
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
