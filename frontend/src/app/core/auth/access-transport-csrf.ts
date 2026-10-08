import { Injectable } from '@angular/core';
import { AccessContext } from '../../domain/access/access-context';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';

export enum TransportCsrfOutcome { Applied, Unknown }

/** Called only inside a dispatched interlock owner, before releasing its queue.
 * Cookie rotation belongs to transport, not to the fenced identity result.
 * Installing this token never authenticates, commits a principal or ends a fence.
 */
@Injectable({ providedIn: 'root' })
export class AccessTransportCsrf {
  constructor(private readonly customer: CustomerSession, private readonly user: UserSession) {}

  reconcile(context: AccessContext, csrf: string | null): TransportCsrfOutcome {
    const token = csrf?.trim();
    if (!context.isKnown || !token) return TransportCsrfOutcome.Unknown;
    if (context === AccessContext.Customer) this.customer.setCsrf(token);
    else this.user.setCsrf(token);
    return TransportCsrfOutcome.Applied;
  }
}
