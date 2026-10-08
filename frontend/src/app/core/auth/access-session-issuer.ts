import { Injectable } from '@angular/core';
import { IdentityRealm, LoginResolution, LoginResolutionKind } from '../../domain/access/access.types';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';

/** Associates a verified response with exactly one existing realm session. */
@Injectable({ providedIn: 'root' })
export class AccessSessionIssuer {
  constructor(private readonly customer: CustomerSession, private readonly user: UserSession) {}
  issue(resolution: LoginResolution, csrf: string | null): LoginResolution {
    if (resolution.kind !== LoginResolutionKind.Authenticated) return resolution;
    if (!csrf?.trim()) return LoginResolution.Unknown;
    const session = resolution.realm === IdentityRealm.Customer ? this.customer : this.user;
    session.setCsrf(csrf);
    session.markAuthenticated();
    return resolution;
  }
}
