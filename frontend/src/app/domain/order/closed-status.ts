import type { ShippingOptionId } from '../shipping/shipping.entity';

abstract class ClosedStatus {
  protected constructor(
    readonly code: string,
    readonly label: string,
  ) {}
}

export class OrderStatus extends ClosedStatus {
  private constructor(code: string, label: string) {
    super(code, label);
  }

  static readonly Paid = new OrderStatus('PAID', 'confirmada');
  static readonly PendingPayment = new OrderStatus('PENDING_PAYMENT', 'pago pendiente');
  static readonly Pending = new OrderStatus('PENDING', 'pendiente');
  static readonly Created = new OrderStatus('CREATED', 'creada');
  static readonly Unknown = new OrderStatus('UNKNOWN', 'desconocido');
  static readonly known = [OrderStatus.Paid, OrderStatus.PendingPayment, OrderStatus.Pending, OrderStatus.Created] as const;

  static fromWire(raw: unknown): OrderStatus {
    return OrderStatus.known.find((status) => status.code === raw) ?? OrderStatus.Unknown;
  }
}

export class PaymentStatus extends ClosedStatus {
  private constructor(code: string, label: string) {
    super(code, label);
  }

  static readonly Pending = new PaymentStatus('PENDING', 'pendiente');
  static readonly Approved = new PaymentStatus('APPROVED', 'aprobado');
  static readonly Rejected = new PaymentStatus('REJECTED', 'rechazado');
  static readonly Unknown = new PaymentStatus('UNKNOWN', 'desconocido');
  static readonly known = [PaymentStatus.Pending, PaymentStatus.Approved, PaymentStatus.Rejected] as const;

  static fromWire(raw: unknown): PaymentStatus {
    return PaymentStatus.known.find((status) => status.code === raw) ?? PaymentStatus.Unknown;
  }
}

export class ShipmentStatus extends ClosedStatus {
  private constructor(
    code: string,
    label: string,
    readonly rank: number,
  ) {
    super(code, label);
  }

  static readonly Pending = new ShipmentStatus('PENDING', 'pendiente', 0);
  static readonly Preparing = new ShipmentStatus('PREPARING', 'en preparación', 1);
  static readonly Packed = new ShipmentStatus('PACKED', 'empaquetado', 2);
  static readonly Shipped = new ShipmentStatus('SHIPPED', 'enviado', 3);
  static readonly Delivered = new ShipmentStatus('DELIVERED', 'entregado', 4);
  static readonly Unknown = new ShipmentStatus('UNKNOWN', 'desconocido', 0);
  static readonly known = [
    ShipmentStatus.Pending,
    ShipmentStatus.Preparing,
    ShipmentStatus.Packed,
    ShipmentStatus.Shipped,
    ShipmentStatus.Delivered,
  ] as const;

  static fromWire(raw: unknown): ShipmentStatus {
    return ShipmentStatus.known.find((status) => status.code === raw) ?? ShipmentStatus.Unknown;
  }

  get asksTracking(): boolean {
    return this === ShipmentStatus.Shipped;
  }

  get actionLabel(): string {
    if (this === ShipmentStatus.Packed) {
      return 'Empacar';
    }
    if (this === ShipmentStatus.Shipped) {
      return 'Enviar';
    }
    if (this === ShipmentStatus.Delivered) {
      return 'Entregar';
    }
    return '';
  }
}

export class RmaStatus extends ClosedStatus {
  private constructor(code: string, label: string, readonly actionLabel: string) {
    super(code, label);
  }

  static readonly Received = new RmaStatus('RECEIVED', 'recibido', 'RMA recibido');
  static readonly ReturnReceived = new RmaStatus('RETURN_RECEIVED', 'devolución recibida', '');
  static readonly Inspected = new RmaStatus('INSPECTED', 'inspeccionado', 'Inspeccionar');
  static readonly Adjusted = new RmaStatus('ADJUSTED', 'ajustado', 'Ajustar stock');
  static readonly Closed = new RmaStatus('CLOSED', 'cerrado', '');
  static readonly Unknown = new RmaStatus('UNKNOWN', 'desconocido', '');
  static readonly known = [
    RmaStatus.Received,
    RmaStatus.ReturnReceived,
    RmaStatus.Inspected,
    RmaStatus.Adjusted,
    RmaStatus.Closed,
  ] as const;

  static fromWire(raw: unknown): RmaStatus {
    return RmaStatus.known.find((status) => status.code === raw) ?? RmaStatus.Unknown;
  }
}

export class DocumentStatus extends ClosedStatus {
  private constructor(code: string, label: string) {
    super(code, label);
  }

  static readonly NotIssued = new DocumentStatus('NOT_ISSUED', 'sin emitir');
  static readonly Issued = new DocumentStatus('ISSUED', 'emitido');
  static readonly Unknown = new DocumentStatus('UNKNOWN', 'desconocido');

  static fromWire(raw: unknown): DocumentStatus {
    if (raw === DocumentStatus.Issued.code) {
      return DocumentStatus.Issued;
    }
    if (raw === DocumentStatus.NotIssued.code) {
      return DocumentStatus.NotIssued;
    }
    return DocumentStatus.Unknown;
  }

  get issued(): boolean {
    return this === DocumentStatus.Issued;
  }
}

export class PaymentMethod extends ClosedStatus {
  private constructor(code: 'MERCADO_PAGO' | 'CASH', label: string) {
    super(code, label);
  }

  static readonly MercadoPago = new PaymentMethod('MERCADO_PAGO', 'Mercado Pago');
  static readonly Cash = new PaymentMethod('CASH', 'efectivo en el local');

  static fromWire(raw: unknown): PaymentMethod | null {
    if (raw === PaymentMethod.MercadoPago.code) {
      return PaymentMethod.MercadoPago;
    }
    if (raw === PaymentMethod.Cash.code) {
      return PaymentMethod.Cash;
    }
    return null;
  }

  static labelOf(method: PaymentMethod | null | undefined): string {
    return method?.label ?? 'sin medio elegido';
  }
}

export class ShippingChoice extends ClosedStatus {
  private constructor(code: ShippingOptionId, label: string, readonly detail: string) {
    super(code, label);
  }

  static readonly Pickup = new ShippingChoice('PICKUP', 'Retiro', 'Retiro en el local.');
  static readonly Standard = new ShippingChoice('STANDARD', 'Estándar', 'Envío estándar simulado. La fecha es una estimación.');
  static readonly Express = new ShippingChoice('EXPRESS', 'Exprés', 'Envío exprés simulado. La fecha es una estimación.');
  static readonly known = [ShippingChoice.Pickup, ShippingChoice.Standard, ShippingChoice.Express] as const;

  static fromWire(raw: string | null): ShippingChoice | null {
    return ShippingChoice.known.find((choice) => choice.code === raw) ?? null;
  }

  get pickup(): boolean {
    return this === ShippingChoice.Pickup;
  }
}
