export class CustomerOrderRefreshPhase {
  private readonly nominal!: 'CustomerOrderRefreshPhase';
  private constructor(
    readonly wire: string,
    readonly label: string,
    readonly busy: boolean,
  ) {}

  static readonly Idle = new CustomerOrderRefreshPhase('IDLE', '', false);
  static readonly Refreshing = new CustomerOrderRefreshPhase('REFRESHING', 'Consultando el estado actual…', true);
  static readonly Succeeded = new CustomerOrderRefreshPhase('SUCCEEDED', 'Estado actualizado.', false);
  static readonly Failed = new CustomerOrderRefreshPhase('FAILED', 'No pudimos actualizar el estado.', false);
  static readonly Unknown = new CustomerOrderRefreshPhase('UNKNOWN', 'No se pudo determinar el estado de actualización.', false);
  private static readonly cases = [
    CustomerOrderRefreshPhase.Idle,
    CustomerOrderRefreshPhase.Refreshing,
    CustomerOrderRefreshPhase.Succeeded,
    CustomerOrderRefreshPhase.Failed,
    CustomerOrderRefreshPhase.Unknown,
  ];

  static fromWire(value: unknown): CustomerOrderRefreshPhase {
    return CustomerOrderRefreshPhase.cases.find((phase) => phase.wire === value) ?? CustomerOrderRefreshPhase.Unknown;
  }
}

export class CustomerOrderReadMode {
  private readonly nominal!: 'CustomerOrderReadMode';
  private constructor(readonly wire: string, readonly preservesSnapshot: boolean) {}

  static readonly Initial = new CustomerOrderReadMode('INITIAL', false);
  static readonly Refresh = new CustomerOrderReadMode('REFRESH', true);
  static readonly Unknown = new CustomerOrderReadMode('UNKNOWN', false);
  private static readonly cases = [CustomerOrderReadMode.Initial, CustomerOrderReadMode.Refresh, CustomerOrderReadMode.Unknown];

  static fromWire(value: unknown): CustomerOrderReadMode {
    return CustomerOrderReadMode.cases.find((mode) => mode.wire === value) ?? CustomerOrderReadMode.Unknown;
  }
}

export class CustomerOrderReadCommand {
  private constructor(readonly orderId: string, readonly mode: CustomerOrderReadMode) {}

  static initial(orderId: string): CustomerOrderReadCommand {
    return new CustomerOrderReadCommand(orderId, CustomerOrderReadMode.Initial);
  }

  static refresh(orderId: string): CustomerOrderReadCommand {
    return new CustomerOrderReadCommand(orderId, CustomerOrderReadMode.Refresh);
  }
}
