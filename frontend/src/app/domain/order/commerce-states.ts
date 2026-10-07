export class OrderStatus {
  private readonly nominal!: 'OrderStatus';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Created = new OrderStatus('CREATED', 'Creado');
  static readonly PendingPayment = new OrderStatus('PENDING_PAYMENT', 'Pago pendiente');
  static readonly Paid = new OrderStatus('PAID', 'Pagado');
  static readonly PaidStockReview = new OrderStatus('PAID_STOCK_REVIEW', 'Stock en revisión');
  static readonly Cancelled = new OrderStatus('CANCELLED', 'Cancelado');
  static readonly Expired = new OrderStatus('EXPIRED', 'Vencido');
  static readonly Refunded = new OrderStatus('REFUNDED', 'Reembolsado');
  static readonly Unknown = new OrderStatus('UNKNOWN', 'Estado desconocido');
  private static readonly cases = [OrderStatus.Created, OrderStatus.PendingPayment, OrderStatus.Paid, OrderStatus.PaidStockReview, OrderStatus.Cancelled, OrderStatus.Expired, OrderStatus.Refunded, OrderStatus.Unknown];
  static fromWire(value: unknown): OrderStatus {
    return OrderStatus.cases.find((state) => state.wire === value) ?? OrderStatus.Unknown;
  }
}

export class PaymentStatus {
  private readonly nominal!: 'PaymentStatus';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Pending = new PaymentStatus('PENDING', 'Pendiente');
  static readonly Approved = new PaymentStatus('APPROVED', 'Acreditado');
  static readonly Rejected = new PaymentStatus('REJECTED', 'Rechazado');
  static readonly Cancelled = new PaymentStatus('CANCELLED', 'Cancelado');
  static readonly Refunded = new PaymentStatus('REFUNDED', 'Reembolsado');
  static readonly ChargedBack = new PaymentStatus('CHARGED_BACK', 'Contracargo');
  static readonly Unknown = new PaymentStatus('UNKNOWN', 'Estado desconocido');
  private static readonly cases = [PaymentStatus.Pending, PaymentStatus.Approved, PaymentStatus.Rejected, PaymentStatus.Cancelled, PaymentStatus.Refunded, PaymentStatus.ChargedBack, PaymentStatus.Unknown];
  static fromWire(value: unknown): PaymentStatus {
    return PaymentStatus.cases.find((state) => state.wire === value) ?? PaymentStatus.Unknown;
  }
}

export class ShipmentStatus {
  private readonly nominal!: 'ShipmentStatus';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly NotCreated = new ShipmentStatus('NOT_CREATED', 'Sin envío');
  static readonly Pending = new ShipmentStatus('PENDING', 'Pendiente');
  static readonly Preparing = new ShipmentStatus('PREPARING', 'Preparando');
  static readonly Shipped = new ShipmentStatus('SHIPPED', 'Enviado');
  static readonly Delivered = new ShipmentStatus('DELIVERED', 'Entregado');
  static readonly Cancelled = new ShipmentStatus('CANCELLED', 'Cancelado');
  static readonly Unknown = new ShipmentStatus('UNKNOWN', 'Estado desconocido');
  private static readonly cases = [ShipmentStatus.NotCreated, ShipmentStatus.Pending, ShipmentStatus.Preparing, ShipmentStatus.Shipped, ShipmentStatus.Delivered, ShipmentStatus.Cancelled, ShipmentStatus.Unknown];
  static fromWire(value: unknown): ShipmentStatus {
    return ShipmentStatus.cases.find((state) => state.wire === value) ?? ShipmentStatus.Unknown;
  }
}

export class RmaStatus {
  private readonly nominal!: 'RmaStatus';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly None = new RmaStatus('NONE', 'Sin devolución');
  static readonly Requested = new RmaStatus('REQUESTED', 'Solicitado');
  static readonly Approved = new RmaStatus('APPROVED', 'Aprobado');
  static readonly ReturnReceived = new RmaStatus('RETURN_RECEIVED', 'Recibido');
  static readonly Inspected = new RmaStatus('INSPECTED', 'Inspeccionado');
  static readonly Rejected = new RmaStatus('REJECTED', 'Rechazado');
  static readonly Closed = new RmaStatus('CLOSED', 'Cerrado');
  static readonly Unknown = new RmaStatus('UNKNOWN', 'Estado desconocido');
  private static readonly cases = [RmaStatus.None, RmaStatus.Requested, RmaStatus.Approved, RmaStatus.ReturnReceived, RmaStatus.Inspected, RmaStatus.Rejected, RmaStatus.Closed, RmaStatus.Unknown];
  static fromWire(value: unknown): RmaStatus {
    return RmaStatus.cases.find((state) => state.wire === value) ?? RmaStatus.Unknown;
  }
}

export class ShipmentTransition {
  private readonly nominal!: 'ShipmentTransition';
  private constructor(readonly wire: string, readonly label: string) {}
  get requiresTracking(): boolean { return this === ShipmentTransition.Shipped; }
  static readonly Packed = new ShipmentTransition('PACKED', 'Empacar');
  static readonly Shipped = new ShipmentTransition('SHIPPED', 'Enviar');
  static readonly Delivered = new ShipmentTransition('DELIVERED', 'Entregar');
  static readonly Unknown = new ShipmentTransition('UNKNOWN', 'Estado desconocido');
  private static readonly cases = [ShipmentTransition.Packed, ShipmentTransition.Shipped, ShipmentTransition.Delivered, ShipmentTransition.Unknown];
  static fromWire(value: unknown): ShipmentTransition {
    return ShipmentTransition.cases.find((state) => state.wire === value) ?? ShipmentTransition.Unknown;
  }
}

export class RmaTransition {
  private readonly nominal!: 'RmaTransition';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Received = new RmaTransition('RECEIVED', 'RMA recibido');
  static readonly Inspected = new RmaTransition('INSPECTED', 'Inspección diferida');
  static readonly Adjusted = new RmaTransition('ADJUSTED', 'Reposición diferida');
  static readonly Unknown = new RmaTransition('UNKNOWN', 'Estado desconocido');
  private static readonly cases = [RmaTransition.Received, RmaTransition.Inspected, RmaTransition.Adjusted, RmaTransition.Unknown];
  static fromWire(value: unknown): RmaTransition {
    return RmaTransition.cases.find((state) => state.wire === value) ?? RmaTransition.Unknown;
  }
}

export class FulfillmentEligibility {
  private readonly nominal!: 'FulfillmentEligibility';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Eligible = new FulfillmentEligibility('ELIGIBLE', 'Habilitado');
  static readonly OrderNotPaid = new FulfillmentEligibility('ORDER_NOT_PAID', 'Pedido sin pago acreditado');
  static readonly PaymentNotVerified = new FulfillmentEligibility('PAYMENT_NOT_VERIFIED', 'Pago sin evidencia verificable');
  static readonly ReversalOrIncident = new FulfillmentEligibility('REVERSAL_OR_INCIDENT', 'Pago en revisión');
  static readonly StockNotVerified = new FulfillmentEligibility('STOCK_NOT_VERIFIED', 'Consumo de stock sin evidencia');
  static readonly Unknown = new FulfillmentEligibility('UNKNOWN', 'Estado desconocido');
  private static readonly cases = [FulfillmentEligibility.Eligible, FulfillmentEligibility.OrderNotPaid, FulfillmentEligibility.PaymentNotVerified, FulfillmentEligibility.ReversalOrIncident, FulfillmentEligibility.StockNotVerified, FulfillmentEligibility.Unknown];
  static fromWire(value: unknown): FulfillmentEligibility {
    return FulfillmentEligibility.cases.find((state) => state.wire === value) ?? FulfillmentEligibility.Unknown;
  }
}
