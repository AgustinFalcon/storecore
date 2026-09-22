import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserSession {
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
