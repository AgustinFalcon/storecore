import { Injectable, computed, signal } from '@angular/core';
import { UserSessionPort } from '../../domain/user/user-session.port';

@Injectable({ providedIn: 'root' })
export class UserSession implements UserSessionPort {
  private readonly signedIn = signal(false);
  private readonly csrfToken = signal('');
  private readonly identityGeneration = signal(0);
  readonly authenticated = computed(() => this.signedIn());

  markAuthenticated(): void {
    this.identityGeneration.update((generation) => generation + 1);
    this.signedIn.set(true);
  }

  generation(): number {
    return this.identityGeneration();
  }

  setCsrf(value: string): void {
    this.csrfToken.set(value.trim());
  }

  csrf(): string {
    return this.csrfToken();
  }

  clear(): void {
    this.identityGeneration.update((generation) => generation + 1);
    this.signedIn.set(false);
    this.csrfToken.set('');
  }
}
