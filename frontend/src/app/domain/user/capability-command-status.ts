export class CapabilityCommandStatus {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Pending = new CapabilityCommandStatus('PENDING', 'Pendiente');
  static readonly Completed = new CapabilityCommandStatus('COMPLETED', 'Completado');
  static readonly Aborted = new CapabilityCommandStatus('ABORTED', 'Cancelado');
  static readonly Unknown = new CapabilityCommandStatus('', 'Resultado no confirmado');
  static fromWire(raw: unknown): CapabilityCommandStatus {
    return [this.Pending, this.Completed, this.Aborted].find(value => value.wire === raw) ?? this.Unknown;
  }
}
