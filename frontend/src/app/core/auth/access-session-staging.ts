import { Injectable } from '@angular/core';
import { AccessContext } from '../../domain/access/access-context';
import { AccessMutationFence } from './access-mutation-fence';

/** Holds a verified unified-response CSRF token until its principal is probed. */
@Injectable({ providedIn: 'root' })
export class AccessSessionStaging {
  private readonly csrfByContext = new Map<AccessContext, { readonly token: string; readonly generation: number }>();
  constructor(private readonly fence: AccessMutationFence) {}

  stage(context: AccessContext, csrf: string): boolean {
    const token = csrf.trim();
    if (!context.isKnown || !token || !this.fence.permitsAuthentication(context)) return false;
    this.csrfByContext.set(context, { token, generation: this.fence.snapshot(context) });
    return true;
  }

  take(context: AccessContext): string | null {
    const staged = this.csrfByContext.get(context);
    this.csrfByContext.delete(context);
    return staged && this.fence.accepts(context, staged.generation) ? staged.token : null;
  }

  clear(context: AccessContext): void {
    this.csrfByContext.delete(context);
  }
}
