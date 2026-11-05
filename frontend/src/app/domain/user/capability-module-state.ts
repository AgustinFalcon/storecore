export class CapabilityModuleState {
  private constructor(readonly wire: string, readonly label: string, readonly tone: string) {}

  static readonly Disabled = new CapabilityModuleState('DISABLED', 'Deshabilitado', 'neutral');
  static readonly ReadOnly = new CapabilityModuleState('READ_ONLY', 'Sólo lectura', 'info');
  static readonly Active = new CapabilityModuleState('ACTIVE', 'Activo', 'success');
  static readonly Paused = new CapabilityModuleState('PAUSED', 'Pausado', 'warning');
  static readonly Error = new CapabilityModuleState('ERROR', 'Con error', 'danger');
  static readonly Unknown = new CapabilityModuleState('UNKNOWN', 'Estado no reconocido', 'neutral');

  static fromWire(raw: unknown): CapabilityModuleState {
    return VALUES.find((value) => value.wire === raw) ?? CapabilityModuleState.Unknown;
  }
}

const VALUES = [CapabilityModuleState.Disabled, CapabilityModuleState.ReadOnly, CapabilityModuleState.Active,
  CapabilityModuleState.Paused, CapabilityModuleState.Error];
