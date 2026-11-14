import { AccessContext } from '../../domain/access/access-context';
import { UserRole } from '../../domain/user/user-role';

export class RouteActor {
  private constructor(readonly wire: string, readonly context: AccessContext | null = null, readonly role: UserRole | null = null) {}
  static readonly Anonymous = new RouteActor('ANONYMOUS');
  static readonly Customer = new RouteActor('CUSTOMER', AccessContext.Customer);
  static readonly Admin = new RouteActor('ADMIN', AccessContext.User, UserRole.Admin);
  static readonly ForeignCustomer = new RouteActor('FOREIGN_CUSTOMER', AccessContext.Customer);
  static readonly Operator = new RouteActor('OPERATOR', AccessContext.User, UserRole.Operator);
  static readonly Unknown = new RouteActor('UNKNOWN');
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
  static readonly Read = new RouteActionClass('READ');
  static readonly Mutation = new RouteActionClass('MUTATION');
  static readonly Rejection = new RouteActionClass('REJECTION');
  static readonly Unknown = new RouteActionClass('UNKNOWN');
  static readonly all = [this.Read, this.Mutation, this.Rejection, this.Unknown] as const;
  static fromWire(raw: unknown): RouteActionClass {
    return this.all.find(value => value.wire === raw) ?? this.Unknown;
  }
}

export class RouteGateResult {
  private constructor(readonly wire: string) {}
  static readonly Accepted = new RouteGateResult('ACCEPTED');
  static readonly Rejected = new RouteGateResult('REJECTED');
  static readonly Unknown = new RouteGateResult('UNKNOWN');
  static readonly all = [this.Accepted, this.Rejected, this.Unknown] as const;
  static fromWire(raw: unknown): RouteGateResult {
    return this.all.find(value => value.wire === raw) ?? this.Unknown;
  }
}

