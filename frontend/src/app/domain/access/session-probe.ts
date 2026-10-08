import { CustomerProfile } from '../customer/customer.entity';
import { UserSessionResult } from '../user/user.entity';
import { AccessContext } from './access-context';

export class ProbeOutcome {
  private constructor() {}
  static readonly Authenticated = new ProbeOutcome();
  static readonly Anonymous = new ProbeOutcome();
  static readonly Unavailable = new ProbeOutcome();
  static readonly Unknown = new ProbeOutcome();
}

export class SessionProbe {
  private constructor(readonly outcome: ProbeOutcome, readonly principal: CustomerProfile | UserSessionResult | null, readonly csrf: string) {}
  static authenticated(principal: CustomerProfile | UserSessionResult, csrf: string): SessionProbe {
    return new SessionProbe(ProbeOutcome.Authenticated, principal, csrf);
  }
  static readonly Anonymous = new SessionProbe(ProbeOutcome.Anonymous, null, '');
  static readonly Unavailable = new SessionProbe(ProbeOutcome.Unavailable, null, '');
  static readonly Unknown = new SessionProbe(ProbeOutcome.Unknown, null, '');
}

export class AccessStateKind {
  private constructor() {}
  static readonly Anonymous = new AccessStateKind();
  static readonly Selected = new AccessStateKind();
  static readonly SelectionRequired = new AccessStateKind();
  static readonly Indeterminate = new AccessStateKind();
}

export class AccessState {
  private constructor(readonly kind: AccessStateKind, readonly contexts: readonly AccessContext[], readonly activeContext: AccessContext) {}
  static readonly Anonymous = new AccessState(AccessStateKind.Anonymous, [], AccessContext.Unknown);
  static readonly Indeterminate = new AccessState(AccessStateKind.Indeterminate, [], AccessContext.Unknown);
  static resolve(customer: SessionProbe, user: SessionProbe, hint: AccessContext): AccessState {
    const contexts = [customer.outcome === ProbeOutcome.Authenticated ? AccessContext.Customer : null,
      user.outcome === ProbeOutcome.Authenticated ? AccessContext.User : null].filter((context): context is AccessContext => context !== null);
    if (contexts.length === 0) return customer === SessionProbe.Anonymous && user === SessionProbe.Anonymous ? AccessState.Anonymous : AccessState.Indeterminate;
    if (contexts.length === 1) return new AccessState(AccessStateKind.Selected, contexts, contexts[0]);
    return contexts.includes(hint) ? new AccessState(AccessStateKind.Selected, contexts, hint)
      : new AccessState(AccessStateKind.SelectionRequired, contexts, AccessContext.Unknown);
  }
  select(context: AccessContext): AccessState {
    return this.contexts.includes(context) ? new AccessState(AccessStateKind.Selected, this.contexts, context) : this;
  }
  permits(context: AccessContext): boolean { return context.isKnown && this.contexts.includes(context); }
}
