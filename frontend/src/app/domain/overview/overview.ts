export class OverviewPeriod {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Today = new OverviewPeriod('TODAY', 'Hoy');
  static readonly Last7Days = new OverviewPeriod('LAST_7_DAYS', 'Últimos 7 días');
  static readonly Last30Days = new OverviewPeriod('LAST_30_DAYS', 'Últimos 30 días');
  static readonly Unknown = new OverviewPeriod('UNKNOWN', 'Período no disponible');
  static readonly selectable = [this.Today, this.Last7Days, this.Last30Days] as const;
  static fromWire(raw: unknown): OverviewPeriod { return this.selectable.find((value) => value.wire === raw) ?? this.Unknown; }
}

export class OverviewFactState {
  private constructor(readonly wire: string, readonly label: string, readonly usable: boolean) {}
  static readonly Known = new OverviewFactState('KNOWN', 'Disponible', true);
  static readonly Unavailable = new OverviewFactState('UNAVAILABLE', 'No disponible', false);
  static readonly Unknown = new OverviewFactState('UNKNOWN', 'Estado no reconocido', false);
  static fromWire(raw: unknown): OverviewFactState {
    return [this.Known, this.Unavailable].find((value) => value.wire === raw) ?? this.Unknown;
  }
}

export class OverviewUnavailableReason {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly PaymentFactsIncomplete = new OverviewUnavailableReason('PAYMENT_FACTS_INCOMPLETE', 'Los datos de pago están incompletos o son contradictorios.');
  static readonly ShipmentFactsIncomplete = new OverviewUnavailableReason('SHIPMENT_FACTS_INCOMPLETE', 'Los datos de envío están incompletos o son contradictorios.');
  static readonly InventoryFactsIncomplete = new OverviewUnavailableReason('INVENTORY_FACTS_INCOMPLETE', 'Los datos de inventario están incompletos o son contradictorios.');
  static readonly Unknown = new OverviewUnavailableReason('UNKNOWN', 'El origen no pudo confirmar este dato.');
  static fromWire(raw: unknown): OverviewUnavailableReason {
    return [this.PaymentFactsIncomplete, this.ShipmentFactsIncomplete, this.InventoryFactsIncomplete].find((value) => value.wire === raw) ?? this.Unknown;
  }
}

export class PendingPaymentReason {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly NoPayment = new PendingPaymentReason('NO_PAYMENT', 'Sin pago registrado');
  static readonly Pending = new PendingPaymentReason('PENDING', 'Pago pendiente');
  static readonly Rejected = new PendingPaymentReason('REJECTED', 'Pago rechazado');
  static readonly Unknown = new PendingPaymentReason('UNKNOWN', 'Motivo no reconocido');
  static fromWire(raw: unknown): PendingPaymentReason {
    return [this.NoPayment, this.Pending, this.Rejected].find((value) => value.wire === raw) ?? this.Unknown;
  }
}

export class OverviewShipmentState {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Missing = new OverviewShipmentState('MISSING', 'Sin envío');
  static readonly Pending = new OverviewShipmentState('PENDING', 'Envío pendiente');
  static readonly Preparing = new OverviewShipmentState('PREPARING', 'Preparando');
  static readonly Shipped = new OverviewShipmentState('SHIPPED', 'Despachado');
  static readonly Unknown = new OverviewShipmentState('UNKNOWN', 'Estado no reconocido');
  static fromWire(raw: unknown): OverviewShipmentState {
    return [this.Missing, this.Pending, this.Preparing, this.Shipped].find((value) => value.wire === raw) ?? this.Unknown;
  }
}

export interface OverviewFact { readonly state: OverviewFactState; readonly value: number | null; readonly reason: OverviewUnavailableReason | null; }
export interface PendingPaymentItem { readonly orderId: number; readonly orderNumber: string; readonly total: number; readonly createdAt: string; readonly reason: PendingPaymentReason; }
export interface FulfillmentItem { readonly orderId: number; readonly orderNumber: string; readonly total: number; readonly paidAt: string; readonly shipmentState: OverviewShipmentState; }
export interface LowStockItem { readonly variantId: number; readonly sku: string; readonly productName: string; readonly variantLabel: string; readonly availableQuantity: number; readonly safetyStock: number; }
export interface OverviewQueue<T> { readonly state: OverviewFactState; readonly items: readonly T[]; readonly totalCount: number | null; readonly truncated: boolean; readonly reason: OverviewUnavailableReason | null; }
export interface OperatorOverview {
  readonly period: OverviewPeriod; readonly timezone: string; readonly fromInclusive: string; readonly toExclusive: string;
  readonly accreditedRevenue: OverviewFact; readonly orderCount: OverviewFact; readonly activeCustomerCount: OverviewFact; readonly inventoryAtRiskCount: OverviewFact;
  readonly pendingPayments: OverviewQueue<PendingPaymentItem>; readonly fulfillment: OverviewQueue<FulfillmentItem>; readonly lowStock: OverviewQueue<LowStockItem>;
}
