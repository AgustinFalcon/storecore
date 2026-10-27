export class InventoryReadState {
  private constructor(readonly wire: string, readonly label: string) {}

  static readonly Idle = new InventoryReadState('IDLE', 'Sin lectura');
  static readonly Loading = new InventoryReadState('LOADING', 'Leyendo inventario');
  static readonly Refreshing = new InventoryReadState('REFRESHING', 'Actualizando inventario');
  static readonly Ready = new InventoryReadState('READY', 'Lectura actualizada');
  static readonly Stale = new InventoryReadState('STALE', 'Se conserva la última lectura');
  static readonly Error = new InventoryReadState('ERROR', 'No se pudo leer el inventario');
  static readonly AccessDenied = new InventoryReadState('ACCESS_DENIED', 'Acceso no disponible');
  static readonly Unknown = new InventoryReadState('UNKNOWN', 'Estado de lectura no reconocido');

  static fromWire(raw: unknown): InventoryReadState {
    return VALUES.find((value) => value.wire === raw) ?? InventoryReadState.Unknown;
  }

  get isLoading(): boolean { return this === InventoryReadState.Loading; }
  get isRefreshing(): boolean { return this === InventoryReadState.Refreshing; }
  get isReady(): boolean { return this === InventoryReadState.Ready; }
  get isStale(): boolean { return this === InventoryReadState.Stale; }
  get isAccessDenied(): boolean { return this === InventoryReadState.AccessDenied; }
}

const VALUES = [InventoryReadState.Idle, InventoryReadState.Loading, InventoryReadState.Refreshing, InventoryReadState.Ready,
  InventoryReadState.Stale, InventoryReadState.Error, InventoryReadState.AccessDenied, InventoryReadState.Unknown];
