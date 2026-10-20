import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { AccessContext } from '../../domain/access/access-context';

/** Invalidates late unified-auth responses before they can install realm state. */
@Injectable({ providedIn: 'root' })
export class AccessMutationFence {
  private customerGeneration = 0;
  private userGeneration = 0;
  private readonly customerCancellation = new Subject<void>();
  private readonly userCancellation = new Subject<void>();
  private readonly revoking = new Set<AccessContext>();

  beginRevocation(context: AccessContext): void { if (context.isKnown) this.revoking.add(context); }
  endRevocation(context: AccessContext): void { this.revoking.delete(context); }
  permitsAuthentication(context: AccessContext = AccessContext.Unknown): boolean {
    return context.isKnown ? !this.revoking.has(context) : this.revoking.size === 0;
  }

  advance(context: AccessContext = AccessContext.Unknown): void {
    if (context === AccessContext.Customer || context === AccessContext.Unknown) {
      ++this.customerGeneration;
      this.customerCancellation.next();
    }
    if (context === AccessContext.User || context === AccessContext.Unknown) {
      ++this.userGeneration;
      this.userCancellation.next();
    }
  }

  snapshot(context: AccessContext): number {
    return context === AccessContext.Customer ? this.customerGeneration
      : context === AccessContext.User ? this.userGeneration : -1;
  }

  accepts(context: AccessContext, generation: number): boolean {
    return context.isKnown && generation === this.snapshot(context);
  }

  cancellation(context: AccessContext): Observable<void> {
    return context === AccessContext.Customer ? this.customerCancellation
      : context === AccessContext.User ? this.userCancellation : new Subject<void>();
  }
}
