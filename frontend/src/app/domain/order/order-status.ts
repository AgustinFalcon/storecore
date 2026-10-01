/**
 * Closed order statuses. The wire is translated once at the HTTP edge.
 */
export class OrderStatus {
  private constructor(
    readonly wire: string,
    readonly label: string,
  ) {}

  static readonly Created = new OrderStatus('CREATED', 'Creada');
  static readonly PendingPayment = new OrderStatus('PENDING_PAYMENT', 'Pendiente de pago');
  static readonly Paid = new OrderStatus('PAID', 'Pagada');
  static readonly PaidStockReview = new OrderStatus('PAID_STOCK_REVIEW', 'Pagada, revisar stock');
  static readonly Cancelled = new OrderStatus('CANCELLED', 'Cancelada');
  static readonly Expired = new OrderStatus('EXPIRED', 'Vencida');
  static readonly Refunded = new OrderStatus('REFUNDED', 'Reembolsada');
  static readonly Unknown = new OrderStatus('', 'Estado de orden no reconocido');

  static fromWire(raw: string | null | undefined): OrderStatus {
    const wire = raw?.trim() ?? '';
    if (!wire) {
      return OrderStatus.Unknown;
    }
    return BY_WIRE.get(wire) ?? OrderStatus.Unknown;
  }
}

const KNOWN: readonly OrderStatus[] = [
  OrderStatus.Created,
  OrderStatus.PendingPayment,
  OrderStatus.Paid,
  OrderStatus.PaidStockReview,
  OrderStatus.Cancelled,
  OrderStatus.Expired,
  OrderStatus.Refunded,
];

const BY_WIRE = new Map(KNOWN.map((status) => [status.wire, status]));
