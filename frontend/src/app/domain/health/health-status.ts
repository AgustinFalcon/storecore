/** Closed health state translated once at the HTTP boundary. */
export class HealthStatus {
  private constructor(
    readonly wire: 'UP' | 'UNKNOWN',
    readonly label: string,
    readonly ready: boolean,
  ) {}

  static readonly Up = new HealthStatus('UP', 'Disponible', true);
  static readonly Unknown = new HealthStatus('UNKNOWN', 'Estado no disponible', false);

  static fromWire(raw: unknown): HealthStatus {
    return raw === 'UP' ? HealthStatus.Up : HealthStatus.Unknown;
  }
}
