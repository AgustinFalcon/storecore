import { Observable } from 'rxjs';
import { AccessContext } from './access-context';

export class RecoveryRealm {
  private constructor(readonly wire: string, readonly label: string, readonly path: string, readonly context: AccessContext) {}
  static readonly Customer = new RecoveryRealm('customer', 'Cuenta de compra', 'customer', AccessContext.Customer);
  static readonly User = new RecoveryRealm('user', 'Administración', 'internal', AccessContext.User);
  static readonly Unknown = new RecoveryRealm('', 'Elegí un acceso', '', AccessContext.Unknown);
  static readonly all = [this.Customer, this.User];
  static fromWire(raw: unknown): RecoveryRealm { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

/** A navigation intent is a preference, never evidence of authentication. */
export class AuthenticateRecoveredRealm {
  private constructor(readonly realm: RecoveryRealm) {}
  static readonly None = new AuthenticateRecoveredRealm(RecoveryRealm.Unknown);
  static forRealm(realm: RecoveryRealm): AuthenticateRecoveredRealm { return realm === RecoveryRealm.Unknown ? this.None : new AuthenticateRecoveredRealm(realm); }
  static fromWire(raw: unknown): AuthenticateRecoveredRealm { return this.forRealm(RecoveryRealm.fromWire(raw)); }
  get active(): boolean { return this.realm !== RecoveryRealm.Unknown; }
}

export class RecoveryOutcome {
  private constructor(readonly wire: string, readonly label: string, readonly terminal = false) {}
  static readonly Accepted = new RecoveryOutcome('ACCEPTED', 'Si corresponde, vas a recibir instrucciones. Revisá también el correo no deseado.');
  static readonly Ready = new RecoveryOutcome('READY', 'Elegí tu nueva contraseña.');
  static readonly Completed = new RecoveryOutcome('COMPLETED', 'Contraseña actualizada. Podés ingresar con tu nueva contraseña.', true);
  static readonly Invalid = new RecoveryOutcome('INVALID_LINK', 'El enlace no es válido. Solicitá uno nuevo.', true);
  static readonly Expired = new RecoveryOutcome('EXPIRED_LINK', 'El enlace venció. Solicitá uno nuevo.', true);
  static readonly Used = new RecoveryOutcome('USED_LINK', 'El enlace ya fue utilizado. Intentá ingresar o solicitá uno nuevo.', true);
  static readonly Superseded = new RecoveryOutcome('SUPERSEDED_LINK', 'El enlace ya no está vigente. Solicitá uno nuevo.', true);
  static readonly PolicyViolation = new RecoveryOutcome('PASSWORD_POLICY_VIOLATION', 'Usá entre 12 y 128 caracteres Unicode, sin recortar espacios.');
  static readonly RateLimited = new RecoveryOutcome('RECOVERY_RATE_LIMITED', 'Esperá antes de volver a intentar.');
  static readonly Unavailable = new RecoveryOutcome('RECOVERY_UNAVAILABLE', 'La recuperación no está disponible. Volvé a intentarlo más tarde.');
  static readonly Uncertain = new RecoveryOutcome('UNCERTAIN', 'No pudimos confirmar el resultado. Intentá ingresar o solicitá un nuevo enlace.', true);
  static readonly Unknown = new RecoveryOutcome('', 'No pudimos interpretar la respuesta. Volvé a iniciar la recuperación.', true);
  static fromWire(raw: unknown): RecoveryOutcome { return [this.Accepted, this.Ready, this.Completed, this.Invalid, this.Expired, this.Used, this.Superseded, this.PolicyViolation, this.RateLimited, this.Unavailable].find(value => value.wire === raw) ?? this.Unknown; }
}

export class RecoveryStage {
  private constructor(readonly wire: string, readonly label: string, readonly busy = false, readonly editable = false) {}
  static readonly Editing = new RecoveryStage('EDITING', 'Completá los datos', false, true);
  static readonly Submitting = new RecoveryStage('SUBMITTING', 'Procesando…', true);
  static readonly Inspecting = new RecoveryStage('INSPECTING', 'Comprobando enlace…', true);
  static readonly Result = new RecoveryStage('RESULT', 'Resultado');
  static readonly Cooldown = new RecoveryStage('COOLDOWN', 'Esperá para reintentar');
  static readonly Unknown = new RecoveryStage('', 'Estado no reconocido');
  static fromWire(raw: unknown): RecoveryStage { return [this.Editing, this.Submitting, this.Inspecting, this.Result, this.Cooldown].find(value => value.wire === raw) ?? this.Unknown; }
}

export interface RecoveryResult { readonly outcome: RecoveryOutcome; readonly expiresAt?: number; readonly retryAfter?: number; }
export interface IRecoveryRepository {
  request(realm: RecoveryRealm, email: string): Observable<RecoveryResult>;
  inspect(realm: RecoveryRealm, token: string): Observable<RecoveryResult>;
  complete(realm: RecoveryRealm, token: string, password: string): Observable<RecoveryResult>;
}

export class CaptureRecoveryRequestStep {
  accepts(realm: RecoveryRealm, email: string): boolean { return realm !== RecoveryRealm.Unknown && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()); }
}
export class CaptureNewPasswordStep {
  accepts(password: string, confirmation: string): boolean { const size = [...password].length; return size >= 12 && size <= 128 && password === confirmation; }
}
export class CaptureRecoveryLinkStep {
  capture(fragment: string): { realm: RecoveryRealm; token: string } {
    const params = new URLSearchParams(fragment.replace(/^#/, ''));
    const realm = RecoveryRealm.fromWire(params.get('realm'));
    const token = params.get('token') ?? '';
    if (params.size !== 2 || params.getAll('realm').length !== 1 || params.getAll('token').length !== 1 || realm === RecoveryRealm.Unknown || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { realm: RecoveryRealm.Unknown, token: '' };
    return { realm, token };
  }
}
export class RequestRecoveryStep {
  constructor(private readonly repository: IRecoveryRepository) {}
  execute(realm: RecoveryRealm, email: string): Observable<RecoveryResult> { return this.repository.request(realm, email.trim()); }
}
export class InspectRecoveryStep {
  constructor(private readonly repository: IRecoveryRepository) {}
  execute(realm: RecoveryRealm, token: string): Observable<RecoveryResult> { return this.repository.inspect(realm, token); }
}
export class CompleteRecoveryStep {
  constructor(private readonly repository: IRecoveryRepository) {}
  execute(realm: RecoveryRealm, token: string, password: string): Observable<RecoveryResult> { return this.repository.complete(realm, token, password); }
}
