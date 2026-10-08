/** Finite access contexts. Unknown never grants navigation or a session. */
export class IdentityRealm {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Customer = new IdentityRealm('CUSTOMER', 'Mi cuenta y compras');
  static readonly User = new IdentityRealm('USER', 'Operaciones del comercio');
  static readonly Unknown = new IdentityRealm('', 'Contexto no reconocido');
  static fromWire(raw: unknown): IdentityRealm {
    return [this.Customer, this.User].find(value => value.wire === raw) ?? this.Unknown;
  }
  get known(): boolean { return this !== IdentityRealm.Unknown; }
}

export class AccessHome {
  private constructor(readonly wire: string, readonly realm: IdentityRealm, readonly route: string | null) {}
  static readonly Storefront = new AccessHome('STOREFRONT', IdentityRealm.Customer, '/');
  static readonly Operations = new AccessHome('OPERATIONS', IdentityRealm.User, '/user/home');
  static readonly Unknown = new AccessHome('', IdentityRealm.Unknown, null);
  static fromWire(raw: unknown): AccessHome {
    return [this.Storefront, this.Operations].find(value => value.wire === raw) ?? this.Unknown;
  }
}

export class ReturnDestination {
  private constructor(readonly wire: string, readonly path: string | null, private readonly realm: IdentityRealm | null) {}
  static readonly Home = new ReturnDestination('HOME', null, null);
  static readonly Catalog = new ReturnDestination('CATALOG', '/catalog', null);
  static readonly CustomerProfile = new ReturnDestination('CUSTOMER_PROFILE', '/customer/profile', IdentityRealm.Customer);
  static readonly CustomerOrders = new ReturnDestination('CUSTOMER_ORDERS', '/customer/orders', IdentityRealm.Customer);
  static readonly UserOrders = new ReturnDestination('USER_ORDERS', '/user/orders', IdentityRealm.User);
  static readonly Unknown = new ReturnDestination('', null, IdentityRealm.Unknown);
  private static readonly destinations = [this.Home, this.Catalog, this.CustomerProfile, this.CustomerOrders, this.UserOrders];
  static fromWire(raw: unknown): ReturnDestination {
    return this.destinations.find(value => value.wire === raw) ?? this.Unknown;
  }
  /** Only normalized, query-free v1 routes may leave the browser as returnPath. */
  static fromPath(raw: unknown): ReturnDestination {
    if (raw === '/') return this.Home;
    return this.destinations.find(value => value.path !== null && value.path === raw) ?? this.Home;
  }
  routeFor(realm: IdentityRealm, home: AccessHome): string | null {
    if (!realm.known || home.realm !== realm || this === ReturnDestination.Unknown) return null;
    return this.realm === null || this.realm === realm ? this.path ?? home.route : home.route;
  }
}

export class LoginStage {
  private constructor(readonly label: string, readonly busy = false, readonly message = '') {}
  static readonly CollectCredentials = new LoginStage('Ingresar');
  static readonly Authenticate = new LoginStage('Verificando credenciales', true);
  static readonly SelectContext = new LoginStage('Elegí cómo continuar');
  static readonly IssueSession = new LoginStage('Abriendo el contexto', true);
  static readonly CompleteAccess = new LoginStage('Acceso confirmado', true);
  static readonly Rejected = new LoginStage('Ingresar', false, 'No pudimos confirmar el acceso. Volvé a ingresar tus credenciales.');
  static readonly Expired = new LoginStage('Ingresar', false, 'La selección venció. Volvé a ingresar tus credenciales.');
  static readonly Error = new LoginStage('Ingresar', false, 'No pudimos completar el acceso. Intentá nuevamente.');
  static readonly Unknown = new LoginStage('Ingresar', false, 'No pudimos confirmar el acceso. Intentá nuevamente.');
  static fromWire(raw: unknown): LoginStage {
    return typeof raw === 'string' ? STAGES.get(raw) ?? this.Unknown : this.Unknown;
  }
  get collecting(): boolean { return this !== LoginStage.SelectContext && this !== LoginStage.IssueSession && this !== LoginStage.CompleteAccess; }
}

const STAGES = new Map<string, LoginStage>([
  ['COLLECT_CREDENTIALS', LoginStage.CollectCredentials], ['AUTHENTICATE', LoginStage.Authenticate],
  ['SELECT_CONTEXT', LoginStage.SelectContext], ['ISSUE_SESSION', LoginStage.IssueSession],
  ['COMPLETE_ACCESS', LoginStage.CompleteAccess], ['REJECTED', LoginStage.Rejected],
  ['EXPIRED', LoginStage.Expired], ['ERROR', LoginStage.Error],
]);

export class LoginResolutionKind {
  private constructor(readonly wire: string) {}
  static readonly Authenticated = new LoginResolutionKind('AUTHENTICATED');
  static readonly ContextSelectionRequired = new LoginResolutionKind('CONTEXT_SELECTION_REQUIRED');
  static readonly Rejected = new LoginResolutionKind('REJECTED');
  static readonly Unknown = new LoginResolutionKind('');
  static fromWire(raw: unknown): LoginResolutionKind {
    return [this.Authenticated, this.ContextSelectionRequired, this.Rejected].find(value => value.wire === raw) ?? this.Unknown;
  }
}

export class LoginResolution {
  private constructor(
    readonly kind: LoginResolutionKind,
    readonly realm = IdentityRealm.Unknown,
    readonly home = AccessHome.Unknown,
    readonly destination = ReturnDestination.Unknown,
    readonly contexts: readonly IdentityRealm[] = [],
    readonly challenge = '',
    readonly expiresAt = 0,
  ) {}
  static readonly Unknown = new LoginResolution(LoginResolutionKind.Unknown);
  static readonly Rejected = new LoginResolution(LoginResolutionKind.Rejected);
  /** Single response boundary: malformed fields fail closed before any effects. */
  static fromWire(raw: unknown): LoginResolution {
    if (!raw || typeof raw !== 'object') return this.Unknown;
    const value = raw as Record<string, unknown>;
    const kind = LoginResolutionKind.fromWire(value['kind']);
    const destination = ReturnDestination.fromWire(
      value['destination'] && typeof value['destination'] === 'object' ? (value['destination'] as Record<string, unknown>)['kind'] : undefined,
    );
    if (kind === LoginResolutionKind.Authenticated) {
      const realm = IdentityRealm.fromWire(value['context']);
      const home = AccessHome.fromWire(value['home']);
      return destination.routeFor(realm, home) === null ? this.Unknown : new LoginResolution(kind, realm, home, destination);
    }
    if (kind === LoginResolutionKind.ContextSelectionRequired) {
      const contexts = Array.isArray(value['contexts']) ? value['contexts'].map(IdentityRealm.fromWire.bind(IdentityRealm)) : [];
      const challenge = value['challenge'];
      const expiresAt = typeof value['expiresAt'] === 'string' ? Date.parse(value['expiresAt']) : NaN;
      if (contexts.length !== 2 || new Set(contexts).size !== 2 || contexts.some(context => !context.known) ||
          typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(challenge) || !Number.isFinite(expiresAt)) return this.Unknown;
      return new LoginResolution(kind, IdentityRealm.Unknown, AccessHome.Unknown, destination, Object.freeze(contexts), challenge, expiresAt);
    }
    return kind === LoginResolutionKind.Rejected ? this.Rejected : this.Unknown;
  }
  get route(): string | null { return this.destination.routeFor(this.realm, this.home); }
}
