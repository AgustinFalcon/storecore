import { Observable } from 'rxjs';
import { RecoveryRealm } from './recovery';

export class EmailOwnership {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Verified = new EmailOwnership('VERIFIED', 'Correo verificado');
  static readonly Unknown = new EmailOwnership('UNKNOWN', 'Correo sin verificar');
  static fromWire(raw: unknown): EmailOwnership { return raw === this.Verified.wire ? this.Verified : this.Unknown; }
}

export class EmailOwnershipReadState {
  private constructor(readonly wire: string, readonly label: string, readonly busy = false) {}
  static readonly Idle = new EmailOwnershipReadState('IDLE', 'Estado del correo pendiente de consulta.');
  static readonly Loading = new EmailOwnershipReadState('LOADING', 'Consultando el estado del correo…', true);
  static readonly Ready = new EmailOwnershipReadState('READY', 'Estado del correo disponible.');
  static readonly Unavailable = new EmailOwnershipReadState('UNAVAILABLE', 'No pudimos consultar el estado del correo. Volvé a intentarlo.');
  static readonly Unknown = new EmailOwnershipReadState('', 'No pudimos interpretar la disponibilidad del estado.');
  static fromWire(raw: unknown): EmailOwnershipReadState { return [this.Idle, this.Loading, this.Ready, this.Unavailable].find(value => value.wire === raw) ?? this.Unknown; }
}

export class VerificationRequestState {
  private constructor(readonly wire: string, readonly label: string, readonly busy = false) {}
  static readonly Idle = new VerificationRequestState('IDLE', 'Podés solicitar un enlace para confirmar tu correo actual.');
  static readonly Submitting = new VerificationRequestState('SUBMITTING', 'Procesando solicitud…', true);
  static readonly Accepted = new VerificationRequestState('ACCEPTED', 'Solicitud aceptada. Si corresponde, se encolarán instrucciones. Revisá también el correo no deseado.');
  static readonly RateLimited = new VerificationRequestState('EMAIL_VERIFICATION_RATE_LIMITED', 'Esperá antes de volver a solicitar un enlace.');
  static readonly Unavailable = new VerificationRequestState('EMAIL_VERIFICATION_UNAVAILABLE', 'La verificación no está disponible. Volvé a intentarlo más tarde.');
  static readonly Unknown = new VerificationRequestState('', 'No pudimos confirmar la solicitud. Volvé a intentarlo más tarde.');
  static fromWire(raw: unknown): VerificationRequestState { return [this.Idle, this.Submitting, this.Accepted, this.RateLimited, this.Unavailable].find(value => value.wire === raw) ?? this.Unknown; }
}

export class VerificationOutcome {
  private constructor(readonly wire: string, readonly label: string, readonly terminal = true) {}
  static readonly Ready = new VerificationOutcome('READY', 'El enlace está vigente. Confirmá que este correo te pertenece.', false);
  static readonly Verified = new VerificationOutcome('VERIFIED', 'Correo verificado. Podés volver a tu cuenta o ingresar.');
  static readonly Invalid = new VerificationOutcome('INVALID_LINK', 'El enlace no es válido. Solicitá uno nuevo desde tu cuenta.');
  static readonly Expired = new VerificationOutcome('EXPIRED_LINK', 'El enlace venció. Solicitá uno nuevo desde tu cuenta.');
  static readonly Used = new VerificationOutcome('USED_LINK', 'El enlace ya fue utilizado. Podés volver a tu cuenta.');
  static readonly Superseded = new VerificationOutcome('SUPERSEDED_LINK', 'El enlace ya no está vigente. Solicitá uno nuevo desde tu cuenta.');
  static readonly RateLimited = new VerificationOutcome('EMAIL_VERIFICATION_RATE_LIMITED', 'Esperá antes de volver a abrir el enlace.');
  static readonly Unavailable = new VerificationOutcome('EMAIL_VERIFICATION_UNAVAILABLE', 'No pudimos comprobar el enlace. Volvé a abrirlo más tarde.');
  static readonly Uncertain = new VerificationOutcome('UNCERTAIN', 'No pudimos confirmar el resultado. Consultá el estado del correo en tu cuenta.');
  static readonly Unknown = new VerificationOutcome('', 'No pudimos interpretar el resultado. Consultá el estado del correo en tu cuenta.');
  static fromWire(raw: unknown): VerificationOutcome { return [this.Ready, this.Verified, this.Invalid, this.Expired, this.Used, this.Superseded, this.RateLimited, this.Unavailable].find(value => value.wire === raw) ?? this.Unknown; }
}

export class VerificationStage {
  private constructor(readonly wire: string, readonly busy = false) {}
  static readonly Inspecting = new VerificationStage('INSPECTING', true);
  static readonly Ready = new VerificationStage('READY');
  static readonly Submitting = new VerificationStage('SUBMITTING', true);
  static readonly Result = new VerificationStage('RESULT');
  static readonly Unknown = new VerificationStage('');
  static fromWire(raw: unknown): VerificationStage { return [this.Inspecting, this.Ready, this.Submitting, this.Result].find(value => value.wire === raw) ?? this.Unknown; }
}

export interface VerificationRequestResult { readonly state: VerificationRequestState; readonly cooldownSeconds?: number; }
export interface VerificationLinkResult { readonly outcome: VerificationOutcome; readonly expiresAt?: number; }
export interface IEmailVerificationRepository {
  ownership(realm: RecoveryRealm): Observable<EmailOwnership>;
  request(realm: RecoveryRealm): Observable<VerificationRequestResult>;
  inspect(realm: RecoveryRealm, token: string): Observable<VerificationLinkResult>;
  complete(realm: RecoveryRealm, token: string): Observable<VerificationLinkResult>;
}

export class CaptureVerificationLinkStep {
  capture(fragment: string): { realm: RecoveryRealm; token: string } {
    // Accept the exact contract, including parameter names, ordering and alphabet.
    const match = /^#?realm=(customer|user)&token=([A-Za-z0-9_-]{43})$/.exec(fragment);
    return match && match[0] === fragment ? { realm: RecoveryRealm.fromWire(match[1]), token: match[2] } : { realm: RecoveryRealm.Unknown, token: '' };
  }
}
export class VerificationFragmentState {
  private constructor(readonly wire: string) {}
  static readonly Waiting = new VerificationFragmentState('WAITING');
  static readonly Captured = new VerificationFragmentState('CAPTURED');
  static readonly Unknown = new VerificationFragmentState('');
  static fromWire(raw: unknown): VerificationFragmentState { return [this.Waiting, this.Captured].find(value => value.wire === raw) ?? this.Unknown; }
  accepts(fragment: string): boolean { return this === VerificationFragmentState.Waiting || this === VerificationFragmentState.Captured && fragment.length > 0; }
}
export class ReadEmailOwnershipStep {
  constructor(private readonly repository: IEmailVerificationRepository) {}
  execute(realm: RecoveryRealm): Observable<EmailOwnership> { return this.repository.ownership(realm); }
}
export class RequestEmailVerificationStep {
  constructor(private readonly repository: IEmailVerificationRepository) {}
  execute(realm: RecoveryRealm): Observable<VerificationRequestResult> { return this.repository.request(realm); }
}
export class InspectEmailVerificationStep {
  constructor(private readonly repository: IEmailVerificationRepository) {}
  execute(realm: RecoveryRealm, token: string): Observable<VerificationLinkResult> { return this.repository.inspect(realm, token); }
}
export class CompleteEmailVerificationStep {
  constructor(private readonly repository: IEmailVerificationRepository) {}
  execute(realm: RecoveryRealm, token: string): Observable<VerificationLinkResult> { return this.repository.complete(realm, token); }
}
