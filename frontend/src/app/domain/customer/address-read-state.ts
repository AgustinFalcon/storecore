export class AddressReadState {
  static readonly Idle = new AddressReadState('idle', '', false, false);
  static readonly Loading = new AddressReadState('loading', 'Cargando direcciones…', false, false);
  static readonly Ready = new AddressReadState('ready', 'Direcciones disponibles', true, true);
  static readonly Empty = new AddressReadState('empty', 'Agregá una dirección para continuar.', true, false);
  static readonly Error = new AddressReadState('error', 'No pudimos cargar tus direcciones.', false, false);
  static readonly Unknown = new AddressReadState('unknown', 'Direcciones no disponibles', false, false);

  private constructor(readonly wire: string, readonly label: string, readonly confirmed: boolean, readonly usable: boolean) {}

  static fromWire(value: unknown): AddressReadState {
    return [this.Idle, this.Loading, this.Ready, this.Empty, this.Error].find((state) => state.wire === value) ?? this.Unknown;
  }
}
