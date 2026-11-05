/** Closed account lifecycle exposed by the StoreCore Mercado Libre read contract. */
export class MercadoLibreAccountStatus {
  private constructor(
    readonly wire: string,
    readonly label: string,
    readonly tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger',
  ) {}

  static readonly Disabled = new MercadoLibreAccountStatus('DISABLED', 'No vinculada', 'neutral');
  static readonly ReadOnly = new MercadoLibreAccountStatus('READ_ONLY', 'Sólo lectura', 'info');
  static readonly Active = new MercadoLibreAccountStatus('ACTIVE', 'Activa', 'success');
  static readonly Paused = new MercadoLibreAccountStatus('PAUSED', 'Pausada', 'warning');
  static readonly Error = new MercadoLibreAccountStatus('ERROR', 'Requiere atención', 'danger');
  static readonly Unknown = new MercadoLibreAccountStatus('UNKNOWN', 'Estado no reconocido', 'warning');

  static fromWire(raw: unknown): MercadoLibreAccountStatus {
    return KNOWN.get(raw) ?? MercadoLibreAccountStatus.Unknown;
  }

  get isOperational(): boolean { return this === MercadoLibreAccountStatus.Active; }
}

const KNOWN = new Map<unknown, MercadoLibreAccountStatus>([
  [MercadoLibreAccountStatus.Disabled.wire, MercadoLibreAccountStatus.Disabled],
  [MercadoLibreAccountStatus.ReadOnly.wire, MercadoLibreAccountStatus.ReadOnly],
  [MercadoLibreAccountStatus.Active.wire, MercadoLibreAccountStatus.Active],
  [MercadoLibreAccountStatus.Paused.wire, MercadoLibreAccountStatus.Paused],
  [MercadoLibreAccountStatus.Error.wire, MercadoLibreAccountStatus.Error],
]);
