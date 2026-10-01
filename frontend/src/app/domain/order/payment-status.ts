/**
 * Closed payment statuses. The wire is translated once at the HTTP edge.
 */
export class PaymentStatus {
  private constructor(
    readonly wire: string,
    readonly label: string,
    readonly tone: 'ok' | 'info' | 'warn' | 'err' | '',
  ) {}

  static readonly Pending = new PaymentStatus('PENDING', 'Pendiente', 'info');
  static readonly Approved = new PaymentStatus('APPROVED', 'Aprobado', 'ok');
  static readonly Rejected = new PaymentStatus('REJECTED', 'Rechazado', 'err');
  static readonly Cancelled = new PaymentStatus('CANCELLED', 'Cancelado', '');
  static readonly Refunded = new PaymentStatus('REFUNDED', 'Reembolsado', 'warn');
  static readonly ChargedBack = new PaymentStatus('CHARGED_BACK', 'Contracargo', 'err');
  static readonly Unknown = new PaymentStatus('', 'Estado de pago no reconocido', '');

  static fromWire(raw: string | null | undefined): PaymentStatus {
    const wire = raw?.trim() ?? '';
    if (!wire) {
      return PaymentStatus.Unknown;
    }
    return BY_WIRE.get(wire) ?? PaymentStatus.Unknown;
  }
}

const KNOWN: readonly PaymentStatus[] = [
  PaymentStatus.Pending,
  PaymentStatus.Approved,
  PaymentStatus.Rejected,
  PaymentStatus.Cancelled,
  PaymentStatus.Refunded,
  PaymentStatus.ChargedBack,
];

const BY_WIRE = new Map(KNOWN.map((status) => [status.wire, status]));
