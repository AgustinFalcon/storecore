/**
 * Closed capability states. Labels live on the type; the view does not switch on raw wires.
 */
export class CapabilityModuleState {
  private constructor(
    readonly wire: string,
    readonly label: string,
    readonly tone: 'ok' | 'info' | 'warn' | 'err' | '',
  ) {}

  static readonly Disabled = new CapabilityModuleState('DISABLED', 'Apagado', '');
  static readonly ReadOnly = new CapabilityModuleState('READ_ONLY', 'Solo lectura', 'info');
  static readonly Active = new CapabilityModuleState('ACTIVE', 'Activo', 'ok');
  static readonly Paused = new CapabilityModuleState('PAUSED', 'Pausado', 'warn');
  static readonly Error = new CapabilityModuleState('ERROR', 'Error', 'err');
  static readonly Unknown = new CapabilityModuleState('', 'Estado no reconocido', '');

  static fromWire(raw: string | null | undefined): CapabilityModuleState {
    return BY_WIRE.get(raw ?? '') ?? CapabilityModuleState.Unknown;
  }

  get isCurrent(): boolean {
    return this !== CapabilityModuleState.Unknown;
  }
}

const KNOWN: readonly CapabilityModuleState[] = [
  CapabilityModuleState.Disabled,
  CapabilityModuleState.ReadOnly,
  CapabilityModuleState.Active,
  CapabilityModuleState.Paused,
  CapabilityModuleState.Error,
];

const BY_WIRE = new Map(KNOWN.map((state) => [state.wire, state]));
