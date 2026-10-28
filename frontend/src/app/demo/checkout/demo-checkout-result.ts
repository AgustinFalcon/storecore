import { OrderStatus, PaymentStatus, ShipmentStatus } from '../../domain/order/commerce-states';
import { DemoContext, DemoProductVariant, type DemoOrder } from '../demo-model';
import { DemoDeliveryMethod, DemoPaymentMethod } from '../demo-process-types';
import { DemoMoney } from './demo-money';

export class DemoResultOutcome {
  private constructor(readonly wire: string, readonly title: string, readonly description: string, readonly actionLabel: string) {}
  static readonly Approved = new DemoResultOutcome('approved', 'Pago acreditado en la demostración', 'El pedido registró un pago aprobado simulado. Consultá el detalle para conocer el estado de entrega.', 'Ver mi pedido');
  static readonly Pending = new DemoResultOutcome('pending', 'Tu pago está pendiente', 'El pedido quedó registrado, pero el pago todavía no está acreditado. No habilita la preparación de la entrega.', 'Revisar mi pedido pendiente');
  static readonly Rejected = new DemoResultOutcome('rejected', 'El pago fue rechazado', 'El pedido no tiene un pago aprobado. Podés revisar el detalle y recuperar los productos para decidir si reintentás.', 'Ver pedido y opciones de reintento');
  static readonly Cancelled = new DemoResultOutcome('cancelled', 'El pago fue cancelado', 'Este pago no habilita la entrega. Revisá el pedido antes de decidir una nueva compra.', 'Ver pedido y opciones de reintento');
  static readonly Review = new DemoResultOutcome('review', 'Este pedido necesita revisión', 'Los datos registrados requieren revisión. No confirmamos un nuevo cobro, envío ni reintegro a partir de este resultado.', 'Consultar el detalle del pedido');
  static readonly Unknown = new DemoResultOutcome('unknown', 'No pudimos interpretar el resultado', 'Hay datos del pedido que no reconocemos. No inferimos aprobación ni iniciamos ninguna operación.', 'Consultar el detalle del pedido');
  static readonly Unavailable = new DemoResultOutcome('unavailable', 'Pedido no disponible', 'No encontramos un pedido disponible para tu cuenta. Podés consultar tus pedidos o volver al catálogo.', 'Ver mis pedidos');
  static readonly all = [this.Approved, this.Pending, this.Rejected, this.Cancelled, this.Review, this.Unavailable] as const;
  static fromWire(raw: unknown): DemoResultOutcome { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class SelectResultOrderStep {
  execute(orders: readonly DemoOrder[], id: string | null, context: DemoContext, actor: string): DemoOrder | null {
    return context === DemoContext.Customer ? orders.find(order => order.id === id && order.actor === actor) ?? null : null;
  }
}

export interface DemoResultPresentation { readonly order: DemoOrder | null; readonly outcome: DemoResultOutcome; readonly merchandise: number | null; readonly shippingKnown: boolean; readonly postalTracking: boolean; }
export class PresentResultStep {
  execute(order: DemoOrder | null): DemoResultPresentation {
    const result = (outcome: DemoResultOutcome, merchandise: number | null = null): DemoResultPresentation => ({ order, outcome, merchandise, shippingKnown: !!order?.delivery && order.delivery.method !== DemoDeliveryMethod.Unknown && Number.isSafeInteger(order.delivery.cost) && order.delivery.cost >= 0 && Number.isSafeInteger(order.delivery.days) && order.delivery.days > 0, postalTracking: outcome === DemoResultOutcome.Approved && !!order?.tracking && order.payment === PaymentStatus.Approved && order.delivery?.method === DemoDeliveryMethod.Home && (order.shipment === ShipmentStatus.Shipped || order.shipment === ShipmentStatus.Delivered) });
    if (!order) return result(DemoResultOutcome.Unavailable);
    if (order.payment === PaymentStatus.Unknown || order.status === OrderStatus.Unknown || order.shipment === ShipmentStatus.Unknown || order.method === DemoPaymentMethod.Unknown || order.delivery?.method === DemoDeliveryMethod.Unknown || order.fulfillment === DemoDeliveryMethod.Unknown || order.lines.some(line => line.variant === DemoProductVariant.Unknown)) return result(DemoResultOutcome.Unknown);
    let merchandise: number;
    try {
      if (!Number.isSafeInteger(order.total) || order.total < 0 || !order.lines.length || order.lines.some(line => line.unit < 0 || !Number.isSafeInteger(line.quantity) || line.quantity < 1)) return result(DemoResultOutcome.Review);
      merchandise = order.lines.reduce((sum, line) => DemoMoney.add(sum, DemoMoney.multiply(line.unit, line.quantity)), 0);
      if (order.total < merchandise) return result(DemoResultOutcome.Review, merchandise);
      if (order.delivery && (DemoMoney.add(merchandise, order.delivery.cost) !== order.total || !Number.isSafeInteger(order.delivery.days) || order.delivery.days < 1 || order.delivery.cost < 0)) return result(DemoResultOutcome.Review, merchandise);
    } catch { return result(DemoResultOutcome.Review); }
    if (order.payment === PaymentStatus.Approved && order.status === OrderStatus.Paid && [ShipmentStatus.NotCreated, ShipmentStatus.Pending, ShipmentStatus.Preparing, ShipmentStatus.Shipped, ShipmentStatus.Delivered].includes(order.shipment)) return result(DemoResultOutcome.Approved, merchandise);
    if (order.payment === PaymentStatus.Pending && order.status === OrderStatus.PendingPayment && [ShipmentStatus.Pending, ShipmentStatus.NotCreated].includes(order.shipment)) return result(DemoResultOutcome.Pending, merchandise);
    if (order.status === OrderStatus.Cancelled && order.shipment === ShipmentStatus.Cancelled) {
      if (order.payment === PaymentStatus.Rejected) return result(DemoResultOutcome.Rejected, merchandise);
      if (order.payment === PaymentStatus.Cancelled) return result(DemoResultOutcome.Cancelled, merchandise);
    }
    return result(DemoResultOutcome.Review, merchandise);
  }
}

/** Pure read workflow. There is deliberately no mutation/payment/retry port. */
export class DemoCheckoutResultPresenter {
  private readonly select = new SelectResultOrderStep();
  private readonly present = new PresentResultStep();
  execute(orders: readonly DemoOrder[], id: string | null, context: DemoContext, actor: string): DemoResultPresentation { return this.present.execute(this.select.execute(orders, id, context, actor)); }
}
