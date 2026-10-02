/** Closed channel-account states; presentation and authorization rules belong here. */
export class MercadoLibreAccountStatus {
  private constructor(readonly wire: string, readonly label: string) {}

  static readonly Disabled = new MercadoLibreAccountStatus('DISABLED', 'Apagada');
  static readonly ReadOnly = new MercadoLibreAccountStatus('READ_ONLY', 'Solo lectura');
  static readonly Active = new MercadoLibreAccountStatus('ACTIVE', 'Activa');
  static readonly Paused = new MercadoLibreAccountStatus('PAUSED', 'Pausada');
  static readonly Error = new MercadoLibreAccountStatus('ERROR', 'Error');
  static readonly Unknown = new MercadoLibreAccountStatus('unknown', 'Estado no reconocido');

  static fromWire(raw: unknown): MercadoLibreAccountStatus {
    return typeof raw === 'string' ? BY_WIRE.get(raw.trim()) ?? this.Unknown : this.Unknown;
  }

  get isActive(): boolean {
    return this === MercadoLibreAccountStatus.Active;
  }
}

const BY_WIRE = new Map([
  MercadoLibreAccountStatus.Disabled,
  MercadoLibreAccountStatus.ReadOnly,
  MercadoLibreAccountStatus.Active,
  MercadoLibreAccountStatus.Paused,
  MercadoLibreAccountStatus.Error,
].map((state) => [state.wire, state]));
