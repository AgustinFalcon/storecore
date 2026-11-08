/** Informational projection; this type does not authorize a customer command. */
export class ReturnEligibility {
  private readonly nominal!: 'ReturnEligibility';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Eligible = new ReturnEligibility('ELIGIBLE', 'Condiciones informativas verificadas');
  static readonly PaymentUnverified = new ReturnEligibility('PAYMENT_UNVERIFIED', 'Pago sin acreditación verificable');
  static readonly NotDelivered = new ReturnEligibility('NOT_DELIVERED', 'Entrega no confirmada');
  static readonly AlreadyOpen = new ReturnEligibility('ALREADY_OPEN', 'Existe una devolución registrada');
  static readonly Unavailable = new ReturnEligibility('UNAVAILABLE', 'Elegibilidad no disponible');
  static readonly Unknown = new ReturnEligibility('UNKNOWN', 'Elegibilidad desconocida');
  static fromWire(raw: unknown): ReturnEligibility {
    return [this.Eligible, this.PaymentUnverified, this.NotDelivered, this.AlreadyOpen, this.Unavailable].find((value) => value.wire === raw) ?? this.Unknown;
  }
}
