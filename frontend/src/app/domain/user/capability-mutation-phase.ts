export class CapabilityMutationPhase {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Idle = new CapabilityMutationPhase('IDLE', '');
  static readonly Editing = new CapabilityMutationPhase('EDITING', 'Revisá el cambio antes de confirmar.');
  static readonly Saving = new CapabilityMutationPhase('SAVING', 'Guardando cambio…');
  static readonly Confirmed = new CapabilityMutationPhase('CONFIRMED', 'Cambio confirmado por el servidor.');
  static readonly Conflict = new CapabilityMutationPhase('CONFLICT', 'La configuración cambió. Revisá la versión actual y confirmá nuevamente.');
  static readonly ResultUncertain = new CapabilityMutationPhase('RESULT_UNCERTAIN', 'No podemos confirmar el resultado. No reenvíes el cambio. Cerrá sesión y volvé a autenticarte para realizar otro cambio.');
  static readonly Rejected = new CapabilityMutationPhase('REJECTED', 'El cambio fue rechazado.');
  static readonly Unknown = new CapabilityMutationPhase('UNKNOWN', 'Resultado no reconocido.');
  get isSaving(): boolean { return this === CapabilityMutationPhase.Saving; }
  static fromWire(raw: unknown): CapabilityMutationPhase {
    return [this.Idle, this.Editing, this.Saving, this.Confirmed, this.Conflict, this.ResultUncertain, this.Rejected].find(value => value.wire === raw) ?? this.Unknown;
  }
}
