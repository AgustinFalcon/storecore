import { AccessContext } from './access-context';
import { AccessHome } from './access-home';
import { ReturnDestination } from './return-destination';
export class LoginResolution {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Authenticated = new LoginResolution('AUTHENTICATED', 'Acceso verificado');
  static readonly ContextSelectionRequired = new LoginResolution('CONTEXT_SELECTION_REQUIRED', 'Elegir acceso');
  static readonly Rejected = new LoginResolution('REJECTED', 'No se pudo verificar el acceso');
  static readonly Unavailable = new LoginResolution('UNAVAILABLE', 'El acceso no está disponible');
  static readonly Unknown = new LoginResolution('', 'Respuesta de acceso no reconocida');
  static fromWire(raw: unknown): LoginResolution { return RESOLUTIONS.get(raw) ?? LoginResolution.Unknown; }
}
const RESOLUTIONS = new Map<unknown, LoginResolution>([LoginResolution.Authenticated, LoginResolution.ContextSelectionRequired, LoginResolution.Rejected, LoginResolution.Unavailable].map((resolution) => [resolution.wire, resolution]));

/** Result data is ephemeral: callers must not persist credentials or challenge state. */
export class LoginResult {
  private constructor(
    readonly resolution: LoginResolution,
    readonly context: AccessContext = AccessContext.Unknown,
    readonly home: AccessHome = AccessHome.Unknown,
    readonly destination: ReturnDestination = ReturnDestination.Unknown,
    readonly challenge: string | null = null,
    readonly contexts: readonly AccessContext[] = [],
    readonly expiresAt: string | null = null,
  ) {}
  static readonly Rejected = new LoginResult(LoginResolution.Rejected);
  static readonly Unavailable = new LoginResult(LoginResolution.Unavailable);
  static readonly Unknown = new LoginResult(LoginResolution.Unknown);
  static authenticated(context: AccessContext, home: AccessHome, destination: ReturnDestination): LoginResult {
    if (!context.isKnown || home !== AccessHome.forContext(context) || !destination.permits(context)) return LoginResult.Unknown;
    return new LoginResult(LoginResolution.Authenticated, context, home, destination);
  }
  static selectionRequired(challenge: string, contexts: readonly AccessContext[], expiresAt: string, destination: ReturnDestination): LoginResult {
    if (challenge.length < 32 || challenge.length > 256 || /\s/.test(challenge) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(expiresAt) || !Number.isFinite(Date.parse(expiresAt)) ||
        contexts.length !== 2 || !contexts.includes(AccessContext.Customer) || !contexts.includes(AccessContext.User) ||
        destination === ReturnDestination.Unknown) return LoginResult.Unknown;
    return new LoginResult(LoginResolution.ContextSelectionRequired, AccessContext.Unknown, AccessHome.Unknown, destination, challenge, Object.freeze([...contexts]), expiresAt);
  }
}
