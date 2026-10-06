import { Injectable } from '@angular/core';
import { AccessContext } from '../../domain/access/access-context';

/** Holds a verified unified-response CSRF token until its principal is probed. */
@Injectable({ providedIn: 'root' })
export class AccessSessionStaging {
  private readonly csrfByContext = new Map<AccessContext, string>();

  stage(context: AccessContext, csrf: string): boolean {
    const token = csrf.trim();
    if (!context.isKnown || !token) return false;
    this.csrfByContext.set(context, token);
    return true;
  }

  take(context: AccessContext): string | null {
    const token = this.csrfByContext.get(context) ?? null;
    this.csrfByContext.delete(context);
    return token;
  }

  clear(context: AccessContext): void {
    this.csrfByContext.delete(context);
  }
}
