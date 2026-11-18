import { AccessContext } from '../../domain/access/access-context';
import { UserRole } from '../../domain/user/user-role';
import evidenceWire from '../../../../route-evidence-wire.json';

export class RouteActor {
  private constructor(readonly wire: string, readonly context: AccessContext | null = null, readonly role: UserRole | null = null) {}
  static readonly Anonymous = new RouteActor(evidenceWire.routeActor.anonymous);
  static readonly Customer = new RouteActor(evidenceWire.routeActor.customer, AccessContext.Customer);
  static readonly Admin = new RouteActor(evidenceWire.routeActor.admin, AccessContext.User, UserRole.Admin);
  static readonly ForeignCustomer = new RouteActor(evidenceWire.routeActor.foreignCustomer, AccessContext.Customer);
  static readonly Operator = new RouteActor(evidenceWire.routeActor.operator, AccessContext.User, UserRole.Operator);
  static readonly Unknown = new RouteActor(evidenceWire.routeActor.unknown);
  static readonly all = [this.Anonymous, this.Customer, this.ForeignCustomer, this.Admin, this.Operator, this.Unknown] as const;
  static fromWire(raw: unknown): RouteActor {
    return this.all.find(actor => actor.wire === raw) ?? this.Unknown;
  }
}

export class RouteScenario {
  private constructor(readonly wire: string) {}
  static readonly Populated = new RouteScenario('POPULATED');
  static readonly InvalidSecret = new RouteScenario('INVALID_SECRET');
  static readonly Unknown = new RouteScenario('UNKNOWN');
  static readonly all = [this.Populated, this.InvalidSecret, this.Unknown] as const;
  static fromWire(raw: unknown): RouteScenario {
    return this.all.find(scenario => scenario.wire === raw) ?? this.Unknown;
  }
}

export class RouteEvidenceMode {
  private constructor(readonly wire: string) {}
  static readonly HttpFixture = new RouteEvidenceMode('HTTP_FIXTURE');
  static readonly RealBackend = new RouteEvidenceMode('REAL_BACKEND');
  static readonly RealBackendLocalProvider = new RouteEvidenceMode('REAL_BACKEND_LOCAL_PROVIDER');
  static readonly Unknown = new RouteEvidenceMode('UNKNOWN');
  static readonly all = [this.HttpFixture, this.RealBackend, this.RealBackendLocalProvider, this.Unknown] as const;
  static fromWire(raw: unknown): RouteEvidenceMode {
    return this.all.find(mode => mode.wire === raw) ?? this.Unknown;
  }
}

export class RouteActionClass {
  private constructor(readonly wire: string) {}
  static readonly Read = new RouteActionClass(evidenceWire.routeActionClass.read);
  static readonly Mutation = new RouteActionClass(evidenceWire.routeActionClass.mutation);
  static readonly Rejection = new RouteActionClass(evidenceWire.routeActionClass.rejection);
  static readonly Unknown = new RouteActionClass(evidenceWire.routeActionClass.unknown);
  static readonly all = [this.Read, this.Mutation, this.Rejection, this.Unknown] as const;
  static fromWire(raw: unknown): RouteActionClass {
    return this.all.find(value => value.wire === raw) ?? this.Unknown;
  }
}

export class RouteGateResult {
  private constructor(readonly wire: string) {}
  static readonly Accepted = new RouteGateResult(evidenceWire.routeGateResult.accepted);
  static readonly Rejected = new RouteGateResult(evidenceWire.routeGateResult.rejected);
  static readonly Unknown = new RouteGateResult(evidenceWire.routeGateResult.unknown);
  static readonly all = [this.Accepted, this.Rejected, this.Unknown] as const;
  static fromWire(raw: unknown): RouteGateResult {
    return this.all.find(value => value.wire === raw) ?? this.Unknown;
  }
}
