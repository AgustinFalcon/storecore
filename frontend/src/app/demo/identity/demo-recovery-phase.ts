/** Finite recovery vocabulary. Neither a phase nor a simulation grants access. */
export class DemoRecoveryPhase {
  private constructor(readonly wire: string, readonly label: string, readonly description: string, readonly canRequest = true) {}

  static readonly Request = new DemoRecoveryPhase('request', 'Solicitar acceso', 'Ingresá un email para recorrer la recuperación simulada.');
  static readonly Submitting = new DemoRecoveryPhase('submitting', 'Registrando solicitud…', 'Conservamos tus datos mientras simulamos la solicitud.', false);
  static readonly Sent = new DemoRecoveryPhase('sent', 'Solicitud registrada', 'Si el perfil existe, la solicitud quedó registrada en esta simulación. No se envió ningún email.');
  static readonly InvalidToken = new DemoRecoveryPhase('invalid-token', 'Enlace inválido', 'El enlace de muestra no es válido. Solicitá uno nuevo.');
  static readonly Expired = new DemoRecoveryPhase('expired', 'Enlace vencido', 'El enlace de muestra venció. Solicitá uno nuevo.');
  static readonly Used = new DemoRecoveryPhase('used', 'Enlace ya utilizado', 'El enlace de muestra ya fue utilizado. Podés solicitar uno nuevo.');
  static readonly Completed = new DemoRecoveryPhase('completed', 'Recuperación simulada completa', 'Podés volver al ingreso Demo. No cambiamos contraseñas, permisos ni sesiones.');
  static readonly ServiceError = new DemoRecoveryPhase('service-error', 'Servicio no disponible', 'No se registró ningún cambio. Reintentá con el mismo email.');
  static readonly Unknown = new DemoRecoveryPhase('', 'Estado desconocido', 'El estado recibido no permite continuar. Volvé a solicitar el acceso.');
  static readonly all = [this.Request, this.Submitting, this.Sent, this.InvalidToken, this.Expired, this.Used, this.Completed, this.ServiceError] as const;
  static readonly specimens = [this.InvalidToken, this.Expired, this.Used, this.ServiceError, this.Completed, this.Unknown] as const;

  static fromWire(raw: unknown): DemoRecoveryPhase { return this.all.find(phase => phase.wire === raw) ?? this.Unknown; }
}
