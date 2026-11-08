import { OrderStatus, PaymentStatus, ShipmentStatus } from './commerce-states';

export class OrderFactState {
  private readonly nominal!: 'OrderFactState';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Known = new OrderFactState('KNOWN', 'Disponible');
  static readonly Unavailable = new OrderFactState('UNAVAILABLE', 'No disponible');
  static readonly Unknown = new OrderFactState('UNKNOWN', 'Dato desconocido');
  static fromWire(raw: unknown): OrderFactState { return [this.Known, this.Unavailable].find((value) => value.wire === raw) ?? this.Unknown; }
}
export class OrderFactReason {
  private readonly nominal!: 'OrderFactReason';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly SourceMissing = new OrderFactReason('SOURCE_MISSING', 'Sin dato histórico registrado');
  static readonly SourceContradictory = new OrderFactReason('SOURCE_CONTRADICTORY', 'Datos incompletos o contradictorios');
  static readonly ExternalNotAvailable = new OrderFactReason('EXTERNAL_NOT_AVAILABLE', 'Fuente externa no disponible');
  static readonly Unknown = new OrderFactReason('UNKNOWN', 'Motivo desconocido');
  static fromWire(raw: unknown): OrderFactReason { return [this.SourceMissing, this.SourceContradictory, this.ExternalNotAvailable].find((value) => value.wire === raw) ?? this.Unknown; }
}
export class OrderTimelineKind {
  private readonly nominal!: 'OrderTimelineKind';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly OrderCreated = new OrderTimelineKind('ORDER_CREATED', 'Orden creada');
  static readonly PaymentPending = new OrderTimelineKind('PAYMENT_PENDING', 'Pago pendiente');
  static readonly PaymentAccredited = new OrderTimelineKind('PAYMENT_ACCREDITED', 'Pago acreditado');
  static readonly PaymentReversed = new OrderTimelineKind('PAYMENT_REVERSED', 'Pago revertido');
  static readonly ShipmentPreparing = new OrderTimelineKind('SHIPMENT_PREPARING', 'Envío en preparación');
  static readonly ShipmentShipped = new OrderTimelineKind('SHIPMENT_SHIPPED', 'Envío despachado');
  static readonly ShipmentDelivered = new OrderTimelineKind('SHIPMENT_DELIVERED', 'Entrega registrada');
  static readonly ShipmentCancelled = new OrderTimelineKind('SHIPMENT_CANCELLED', 'Envío cancelado');
  static readonly ReturnOpened = new OrderTimelineKind('RETURN_OPENED', 'Devolución registrada');
  static readonly ReturnResolved = new OrderTimelineKind('RETURN_RESOLVED', 'Devolución resuelta');
  static readonly Unknown = new OrderTimelineKind('UNKNOWN', 'Evento desconocido');
  static fromWire(raw: unknown): OrderTimelineKind { return [this.OrderCreated, this.PaymentPending, this.PaymentAccredited, this.PaymentReversed, this.ShipmentPreparing, this.ShipmentShipped, this.ShipmentDelivered, this.ShipmentCancelled, this.ReturnOpened, this.ReturnResolved].find((value) => value.wire === raw) ?? this.Unknown; }
}
export interface OrderFact<T> { readonly state: OrderFactState; readonly value: T | null; readonly reason: OrderFactReason | null; }
export interface DeliverySnapshot { readonly recipient: string | null; readonly street: string | null; readonly city: string | null; readonly province: string | null; readonly postalCode: string | null; readonly country: string | null; }
export interface OrderTimelineEvent { readonly id: string; readonly kind: OrderTimelineKind; readonly occurredAt: string | null; }
export interface OrderQuery { readonly page: number; readonly size: number; readonly orderStatus?: OrderStatus; readonly paymentStatus?: PaymentStatus; readonly shipmentStatus?: ShipmentStatus; }
export interface OrderPage<T> { readonly items: readonly T[]; readonly page: number; readonly size: number; readonly total: number; readonly truncated: boolean; }
export const firstOrderPage: OrderQuery = { page: 0, size: 25 };
