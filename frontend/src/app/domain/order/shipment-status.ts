/**
 * Closed shipment states and the one-step transitions the console may send.
 */
export class ShipmentTransition {
  private constructor(
    readonly wire: string,
    readonly label: string,
    readonly requiresTracking: boolean,
  ) {}

  static readonly Packed = new ShipmentTransition('PACKED', 'Empacar', false);
  static readonly Shipped = new ShipmentTransition('SHIPPED', 'Enviar', true);
  static readonly Delivered = new ShipmentTransition('DELIVERED', 'Entregar', false);
  static readonly Unknown = new ShipmentTransition('', 'Transición de envío no reconocida', false);

  static fromWire(raw: string | null | undefined): ShipmentTransition {
    const wire = raw?.trim() ?? '';
    return BY_WIRE.get(wire) ?? ShipmentTransition.Unknown;
  }
}

const TRANSITIONS: readonly ShipmentTransition[] = [
  ShipmentTransition.Packed,
  ShipmentTransition.Shipped,
  ShipmentTransition.Delivered,
];

const BY_WIRE = new Map(TRANSITIONS.map((status) => [status.wire, status]));

export class ShipmentStatus {
  private constructor(
    readonly wire: string,
    readonly label: string,
    private readonly nextTransition: ShipmentTransition | null,
  ) {}

  static readonly Pending = new ShipmentStatus('PENDING', 'Pendiente', ShipmentTransition.Packed);
  static readonly Preparing = new ShipmentStatus('PREPARING', 'Preparando', ShipmentTransition.Shipped);
  static readonly Shipped = new ShipmentStatus('SHIPPED', 'Enviado', ShipmentTransition.Delivered);
  static readonly Delivered = new ShipmentStatus('DELIVERED', 'Entregado', null);
  static readonly Cancelled = new ShipmentStatus('CANCELLED', 'Cancelado', ShipmentTransition.Packed);
  static readonly Unknown = new ShipmentStatus('', 'Estado de envío no reconocido', ShipmentTransition.Packed);

  static fromWire(raw: string | null | undefined): ShipmentStatus {
    const wire = raw?.trim() ?? '';
    if (!wire) {
      return ShipmentStatus.Unknown;
    }
    return BY_STATUS.get(wire) ?? ShipmentStatus.Unknown;
  }

  get next(): ShipmentTransition | null {
    return this.nextTransition;
  }
}

const STATUSES: readonly ShipmentStatus[] = [
  ShipmentStatus.Pending,
  ShipmentStatus.Preparing,
  ShipmentStatus.Shipped,
  ShipmentStatus.Delivered,
  ShipmentStatus.Cancelled,
];

const BY_STATUS = new Map(STATUSES.map((status) => [status.wire, status]));
