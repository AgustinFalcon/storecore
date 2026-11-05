export class CapabilityReadState {
  private constructor(readonly wire: string, readonly label: string) {}

  static readonly Idle = new CapabilityReadState('IDLE', 'Sin lectura');
  static readonly Loading = new CapabilityReadState('LOADING', 'Leyendo módulos');
  static readonly Refreshing = new CapabilityReadState('REFRESHING', 'Actualizando módulos');
  static readonly Ready = new CapabilityReadState('READY', 'Lectura actualizada');
  static readonly Stale = new CapabilityReadState('STALE', 'Se conserva la última lectura');
  static readonly Error = new CapabilityReadState('ERROR', 'No se pudieron leer los módulos');
  static readonly AccessDenied = new CapabilityReadState('ACCESS_DENIED', 'Acceso no disponible');
  static readonly Unknown = new CapabilityReadState('UNKNOWN', 'Estado de lectura no reconocido');

  static fromWire(raw: unknown): CapabilityReadState {
    return VALUES.find((value) => value.wire === raw) ?? CapabilityReadState.Unknown;
  }

  get isLoading(): boolean { return this === CapabilityReadState.Loading; }
  get isRefreshing(): boolean { return this === CapabilityReadState.Refreshing; }
  get isReady(): boolean { return this === CapabilityReadState.Ready; }
  get isStale(): boolean { return this === CapabilityReadState.Stale; }
  get isAccessDenied(): boolean { return this === CapabilityReadState.AccessDenied; }
}

const VALUES = [CapabilityReadState.Idle, CapabilityReadState.Loading, CapabilityReadState.Refreshing,
  CapabilityReadState.Ready, CapabilityReadState.Stale, CapabilityReadState.Error,
  CapabilityReadState.AccessDenied, CapabilityReadState.Unknown];
