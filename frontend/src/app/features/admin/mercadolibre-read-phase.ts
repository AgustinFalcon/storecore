export class MercadoLibreReadPhase {
  private constructor(readonly wire: string, readonly label: string) {}

  static readonly Idle = new MercadoLibreReadPhase('IDLE', 'Sin lectura');
  static readonly Loading = new MercadoLibreReadPhase('LOADING', 'Leyendo Mercado Libre');
  static readonly Refreshing = new MercadoLibreReadPhase('REFRESHING', 'Actualizando Mercado Libre');
  static readonly Ready = new MercadoLibreReadPhase('READY', 'Lectura actualizada');
  static readonly Stale = new MercadoLibreReadPhase('STALE', 'Se conserva la última lectura');
  static readonly Error = new MercadoLibreReadPhase('ERROR', 'No se pudo leer Mercado Libre');
  static readonly AccessDenied = new MercadoLibreReadPhase('ACCESS_DENIED', 'Acceso no disponible');
  static readonly Unknown = new MercadoLibreReadPhase('UNKNOWN', 'Estado de lectura no reconocido');

  static fromWire(raw: unknown): MercadoLibreReadPhase {
    return VALUES.find((value) => value.wire === raw) ?? MercadoLibreReadPhase.Unknown;
  }

  get isLoading(): boolean { return this === MercadoLibreReadPhase.Loading; }
  get isRefreshing(): boolean { return this === MercadoLibreReadPhase.Refreshing; }
  get isReady(): boolean { return this === MercadoLibreReadPhase.Ready; }
  get isStale(): boolean { return this === MercadoLibreReadPhase.Stale; }
  get isError(): boolean { return this === MercadoLibreReadPhase.Error; }
  get isAccessDenied(): boolean { return this === MercadoLibreReadPhase.AccessDenied; }
}

const VALUES = [
  MercadoLibreReadPhase.Idle,
  MercadoLibreReadPhase.Loading,
  MercadoLibreReadPhase.Refreshing,
  MercadoLibreReadPhase.Ready,
  MercadoLibreReadPhase.Stale,
  MercadoLibreReadPhase.Error,
  MercadoLibreReadPhase.AccessDenied,
  MercadoLibreReadPhase.Unknown,
];
