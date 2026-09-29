import { DocumentStatus, PaymentMethod, PaymentStatus, ShippingChoice, ShipmentStatus } from './closed-status';
import { MilestonePaint, OrderMilestone } from './order-milestone';

export interface OrderFacts {
  readonly payment: PaymentStatus;
  readonly method: PaymentMethod | null;
  readonly shipment: ShipmentStatus;
  readonly tracking: string | null;
  readonly shipping: ShippingChoice | null;
  readonly document: DocumentStatus;
}

export interface MilestoneRule {
  readonly id: string;
  label(facts: OrderFacts): string;
  detail(facts: OrderFacts): string;
  reached(facts: OrderFacts): boolean;
}

class OrderEntered implements MilestoneRule {
  readonly id = 'order';
  label(_facts: OrderFacts): string {
    return 'Pedido ingresado';
  }
  detail(_facts: OrderFacts): string {
    return 'La orden quedó registrada.';
  }
  reached(): boolean {
    return true;
  }
}

class PaymentStep implements MilestoneRule {
  readonly id = 'payment';
  label(_facts: OrderFacts): string {
    return 'Pago';
  }
  detail(facts: OrderFacts): string {
    if (facts.payment === PaymentStatus.Approved) {
      return 'El servidor marcó el pago acreditado.';
    }
    if (facts.payment === PaymentStatus.Rejected) {
      return 'El servidor marcó el pago rechazado. La orden sigue.';
    }
    if (facts.method === PaymentMethod.Cash) {
      return 'El pago sigue pendiente. El efectivo se cobra en el local.';
    }
    if (facts.method === PaymentMethod.MercadoPago) {
      return 'El pago sigue pendiente. Mercado Pago acredita en su sitio.';
    }
    return 'El pago sigue pendiente.';
  }
  reached(facts: OrderFacts): boolean {
    return facts.payment === PaymentStatus.Approved;
  }
}

class ShippingStep implements MilestoneRule {
  readonly id = 'shipping';
  label(_facts: OrderFacts): string {
    return 'Envío elegido';
  }
  detail(facts: OrderFacts): string {
    return facts.shipping?.detail ?? 'Falta elegir retiro, estándar o exprés.';
  }
  reached(facts: OrderFacts): boolean {
    return facts.shipping !== null && facts.shipping !== ShippingChoice.Unknown;
  }
}

class InvoiceStep implements MilestoneRule {
  readonly id = 'invoice';
  label(_facts: OrderFacts): string {
    return 'Comprobante';
  }
  detail(_facts: OrderFacts): string {
    return 'Los datos del comprobante están en su pantalla. Esta página no emite.';
  }
  reached(_facts: OrderFacts): boolean {
    return false;
  }
}

class PreparingStep implements MilestoneRule {
  readonly id = 'preparing';
  label(_facts: OrderFacts): string {
    return 'En preparación';
  }
  detail(_facts: OrderFacts): string {
    return 'El pedido se está preparando.';
  }
  reached(facts: OrderFacts): boolean {
    return facts.shipment.rank >= ShipmentStatus.Preparing.rank;
  }
}

class PackedStep implements MilestoneRule {
  readonly id = 'packed';
  label(_facts: OrderFacts): string {
    return 'Empaquetado';
  }
  detail(_facts: OrderFacts): string {
    return 'El pedido está empaquetado.';
  }
  reached(facts: OrderFacts): boolean {
    return facts.shipment.rank >= ShipmentStatus.Packed.rank;
  }
}

class DispatchStep implements MilestoneRule {
  readonly id = 'dispatched';
  label(_facts: OrderFacts): string {
    return 'Despachado';
  }
  detail(facts: OrderFacts): string {
    if (facts.tracking) {
      return `Número de seguimiento: ${facts.tracking}. Lo cargó el operador. Esta pantalla no consulta a Correo Argentino.`;
    }
    if (facts.shipment.rank >= ShipmentStatus.Shipped.rank) {
      return 'Despachado. Todavía no hay número de seguimiento.';
    }
    return 'El número aparece cuando el operador lo carga.';
  }
  reached(facts: OrderFacts): boolean {
    return facts.shipment.rank >= ShipmentStatus.Shipped.rank;
  }
}

class ReadyStep implements MilestoneRule {
  readonly id = 'ready';
  label(_facts: OrderFacts): string {
    return 'Listo para retirar';
  }
  detail(_facts: OrderFacts): string {
    return 'El pedido espera en el local. No hay número de seguimiento.';
  }
  reached(facts: OrderFacts): boolean {
    return facts.shipment.rank >= ShipmentStatus.Packed.rank;
  }
}

class DeliveredStep implements MilestoneRule {
  readonly id = 'delivered';
  label(facts: OrderFacts): string {
    return facts?.shipping?.pickup ? 'Retirado' : 'Entregado';
  }
  detail(facts: OrderFacts): string {
    return facts.shipping?.pickup ? 'El customer retiró el pedido.' : 'El pedido figura entregado.';
  }
  reached(facts: OrderFacts): boolean {
    return facts.shipment.rank >= ShipmentStatus.Delivered.rank;
  }
}

const shippedPath: readonly MilestoneRule[] = [
  new OrderEntered(),
  new PaymentStep(),
  new ShippingStep(),
  new InvoiceStep(),
  new PreparingStep(),
  new PackedStep(),
  new DispatchStep(),
  new DeliveredStep(),
];

const pickupPath: readonly MilestoneRule[] = [
  new OrderEntered(),
  new PaymentStep(),
  new ShippingStep(),
  new InvoiceStep(),
  new PreparingStep(),
  new PackedStep(),
  new ReadyStep(),
  new DeliveredStep(),
];

export function orderMilestones(facts: OrderFacts): readonly OrderMilestone[] {
  const rules = facts.shipping?.pickup ? pickupPath : shippedPath;
  const lastReached = rules.reduce((last, rule, index) => (rule.reached(facts) ? index : last), -1);
  return rules.map((rule, index) => ({
    id: rule.id,
    label: rule.label(facts),
    detail: rule.detail(facts),
    state: index === lastReached ? MilestonePaint.Current : rule.reached(facts) ? MilestonePaint.Done : MilestonePaint.Upcoming,
  }));
}
