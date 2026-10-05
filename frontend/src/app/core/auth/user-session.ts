import { Injectable, computed, signal } from '@angular/core';
import { UserSessionPort } from '../../domain/user/user-session.port';

@Injectable({ providedIn: 'root' })
export class UserSession implements UserSessionPort {
  private readonly signedIn = signal(false);
  private readonly csrfToken = signal('');
  readonly authenticated = computed(() => this.signedIn());

  markAuthenticated(): void {
    this.signedIn.set(true);
  }

  setCsrf(value: string): void {
    this.csrfToken.set(value.trim());
  }

  csrf(): string {
    return this.csrfToken();
  }

  clear(): void {
    this.signedIn.set(false);
    this.csrfToken.set('');
  }
}
