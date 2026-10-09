import { ShipmentStatus } from '../domain/order/shipment-status';
import { PaymentStatus } from '../domain/order/payment-status';
import { OrderStatus } from '../domain/order/order-status';
import { DemoDeliveryMethod } from './demo-process-types';
import type { DemoOrder } from './demo-model';
export const DEMO_PICKUP_POINT = Object.freeze({ store: 'StoreCore · sucursal Centro', location: 'Av. de muestra 123, Buenos Aires', hours: 'Lunes a viernes de 9 a 18 h' });

export class DemoFulfillmentPhase {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Preparing = new DemoFulfillmentPhase('preparing', 'Preparando');
  static readonly Transit = new DemoFulfillmentPhase('transit', 'Enviado');
  static readonly Delivered = new DemoFulfillmentPhase('delivered', 'Entregado');
  static readonly Ready = new DemoFulfillmentPhase('ready', 'Listo para retirar');
  static readonly Collected = new DemoFulfillmentPhase('collected', 'Retirado por el comprador');
  static readonly Unknown = new DemoFulfillmentPhase('', 'Entrega pendiente de conciliación');
  static readonly all = [this.Preparing, this.Transit, this.Delivered, this.Ready, this.Collected];
  static fromWire(raw: unknown): DemoFulfillmentPhase { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  get complete(): boolean { return this === DemoFulfillmentPhase.Delivered || this === DemoFulfillmentPhase.Collected; }
}
export class DemoFulfillmentAction {
  private constructor(readonly wire: string, readonly label: string, readonly needsNote: boolean, readonly execute: (order: DemoOrder, value: DemoFulfillment, note: string, deadline?: string) => void) {}
  static readonly Dispatch = new DemoFulfillmentAction('dispatch', 'Despachar envío', false, (order, value) => { value.phase = DemoFulfillmentPhase.Transit; order.shipment = ShipmentStatus.Shipped; });
  static readonly Deliver = new DemoFulfillmentAction('deliver', 'Confirmar entrega en domicilio', false, (order, value) => { value.phase = DemoFulfillmentPhase.Delivered; value.attempts++; order.shipment = ShipmentStatus.Delivered; });
  static readonly FailedAttempt = new DemoFulfillmentAction('failed-attempt', 'Registrar intento fallido', true, (_, value, note) => { value.attempts++; value.incident = DemoIncidentKind.Delivery; value.incidentText = note; });
  static readonly Retry = new DemoFulfillmentAction('retry', 'Programar nuevo intento', true, (_, value, note) => { value.resolution = note; value.incident = DemoIncidentKind.None; value.incidentText = ''; });
  static readonly Ready = new DemoFulfillmentAction('ready', 'Marcar listo para retirar', false, (order, value) => { value.phase = DemoFulfillmentPhase.Ready; order.shipment = ShipmentStatus.Shipped; });
  static readonly Collect = new DemoFulfillmentAction('collect', 'Confirmar retiro', false, (order, value) => { value.phase = DemoFulfillmentPhase.Collected; order.shipment = ShipmentStatus.Delivered; });
  static readonly NoShow = new DemoFulfillmentAction('no-show', 'Registrar retiro no realizado', true, (_, value, note) => { value.incident = DemoIncidentKind.Pickup; value.incidentText = note; });
  static readonly Extend = new DemoFulfillmentAction('extend', 'Extender plazo de retiro', true, (_, value, note, deadline) => { if (!deadline || !validPickupDate(deadline) || deadline <= value.pickupDeadline) throw new Error('Elegí un nuevo plazo posterior al actual.'); value.pickupDeadline = deadline; value.resolution = note; value.incident = DemoIncidentKind.None; value.incidentText = ''; });
  static readonly Unknown = new DemoFulfillmentAction('', 'Acción no disponible', false, () => { throw new Error('Acción desconocida.'); });
  static readonly all = [this.Dispatch, this.Deliver, this.FailedAttempt, this.Retry, this.Ready, this.Collect, this.NoShow, this.Extend];
  static fromWire(raw: unknown): DemoFulfillmentAction { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoIncidentKind {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly None = new DemoIncidentKind('none', 'Sin incidencia');
  static readonly Delivery = new DemoIncidentKind('delivery', 'Intento de entrega fallido');
  static readonly Pickup = new DemoIncidentKind('pickup', 'Retiro no realizado');
  static readonly Report = new DemoIncidentKind('report', 'Consulta del comprador');
  static readonly Unknown = new DemoIncidentKind('', 'Incidencia desconocida');
  static fromWire(raw: unknown): DemoIncidentKind { return [this.None, this.Delivery, this.Pickup, this.Report].find(value => value.wire === raw) ?? this.Unknown; }
}
export interface DemoFulfillment {
  phase: DemoFulfillmentPhase; recipient: string; phone: string; carrier: string; service: string;
  store: string; location: string; hours: string; pickupDeadline: string; attempts: number;
  incident: DemoIncidentKind; incidentText: string; resolution: string;
  lastAction?: DemoFulfillmentAction; lastNote?: string; lastDeadline?: string;
}
function validPickupDate(value: string): boolean { const date = new Date(`${value}T12:00:00.000Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
export function ensureFulfillment(order: DemoOrder): DemoFulfillment {
  if (order.fulfillment) return order.fulfillment;
  const pickup = order.delivery?.method === DemoDeliveryMethod.Pickup;
  const phase = order.shipment === ShipmentStatus.Preparing ? DemoFulfillmentPhase.Preparing : order.shipment === ShipmentStatus.Shipped ? (pickup ? DemoFulfillmentPhase.Ready : DemoFulfillmentPhase.Transit) : order.shipment === ShipmentStatus.Delivered ? (pickup ? DemoFulfillmentPhase.Collected : DemoFulfillmentPhase.Delivered) : DemoFulfillmentPhase.Unknown;
  return order.fulfillment = { phase, recipient: 'Comprador de muestra', phone: '011 5555 0100', carrier: 'Correo de muestra', service: 'Estándar', ...DEMO_PICKUP_POINT, pickupDeadline: '2026-12-31', attempts: phase === DemoFulfillmentPhase.Delivered ? 1 : 0, incident: order.incident ? DemoIncidentKind.Report : DemoIncidentKind.None, incidentText: order.incident ?? '', resolution: '' };
}
/** One policy is shared by admin commands and buyer presentation. Incidents never replace delivery phase. */
export class DemoFulfillmentPolicy {
  actions(order: DemoOrder): DemoFulfillmentAction[] {
    const value = ensureFulfillment(order); const method = order.delivery?.method ?? DemoDeliveryMethod.Home;
    if (order.status === OrderStatus.Unknown || order.payment !== PaymentStatus.Approved || value.phase === DemoFulfillmentPhase.Unknown || value.incident === DemoIncidentKind.Unknown || value.lastAction === DemoFulfillmentAction.Unknown || method === DemoDeliveryMethod.Unknown || value.phase.complete) return [];
    if (method === DemoDeliveryMethod.Home) {
      if (value.phase === DemoFulfillmentPhase.Preparing) return value.incident === DemoIncidentKind.None && [value.recipient, value.phone, value.carrier, value.service, order.address].every(field => !!field.trim()) ? [DemoFulfillmentAction.Dispatch] : [];
      if (value.phase === DemoFulfillmentPhase.Transit) return value.incident === DemoIncidentKind.Delivery ? [DemoFulfillmentAction.Retry] : value.incident === DemoIncidentKind.None ? [DemoFulfillmentAction.Deliver, DemoFulfillmentAction.FailedAttempt] : [];
    } else if (method === DemoDeliveryMethod.Pickup) {
      if (value.phase === DemoFulfillmentPhase.Preparing) return value.incident === DemoIncidentKind.None ? [DemoFulfillmentAction.Ready] : [];
      if (value.phase === DemoFulfillmentPhase.Ready) return value.incident === DemoIncidentKind.Pickup ? [DemoFulfillmentAction.Extend] : value.incident === DemoIncidentKind.None ? [DemoFulfillmentAction.Collect, DemoFulfillmentAction.NoShow] : [];
    }
    return [];
  }
  configure(order: DemoOrder, draft: DemoFulfillment): void {
    const value = ensureFulfillment(order);
    if (order.status === OrderStatus.Unknown || order.payment !== PaymentStatus.Approved || value.phase !== DemoFulfillmentPhase.Preparing || value.incident === DemoIncidentKind.Unknown || order.delivery?.method === DemoDeliveryMethod.Unknown) throw new Error('Los datos de entrega sólo se editan antes de preparar el despacho o retiro.');
    const fields = order.delivery?.method === DemoDeliveryMethod.Pickup ? [draft.store, draft.location, draft.hours, draft.pickupDeadline] : [draft.recipient, draft.phone, draft.carrier, draft.service];
    if (fields.some(field => typeof field !== 'string' || !field.trim()) || (order.delivery?.method === DemoDeliveryMethod.Pickup && !validPickupDate(draft.pickupDeadline))) throw new Error('Completá los datos de la modalidad de entrega.');
    for (const key of ['recipient', 'phone', 'carrier', 'service', 'store', 'location', 'hours', 'pickupDeadline'] as const) value[key] = draft[key].trim();
    if (order.delivery?.method === DemoDeliveryMethod.Pickup) { order.address = `Retiro en ${value.store} · ${value.location} · ${value.hours}`; order.delivery.destination = order.address; }
  }
  apply(order: DemoOrder, action: DemoFulfillmentAction, note: string, pickupDeadline?: string): string | undefined {
    const value = ensureFulfillment(order);
    if (order.status === OrderStatus.Unknown || order.payment !== PaymentStatus.Approved || value.phase === DemoFulfillmentPhase.Unknown || value.incident === DemoIncidentKind.Unknown || value.lastAction === DemoFulfillmentAction.Unknown || order.delivery?.method === DemoDeliveryMethod.Unknown) throw new Error('El seguimiento requiere conciliación antes de continuar.');
    if (action !== DemoFulfillmentAction.Unknown && value.lastAction === action && value.lastNote === note.trim() && value.lastDeadline === (pickupDeadline ?? '')) return;
    if (!this.actions(order).includes(action)) throw new Error('Esta acción no está disponible para la modalidad y estado actuales.');
    if (action.needsNote && !note.trim()) throw new Error('Indicá el motivo o la coordinación del próximo intento.');
    action.execute(order, value, note.trim(), pickupDeadline);
    order.incident = value.incidentText;
    value.lastAction = action; value.lastNote = note.trim(); value.lastDeadline = pickupDeadline ?? '';
    return `${action.label} · ${value.phase.label}${note.trim() ? ` · ${note.trim()}` : ''}`;
  }
}
export function decodeFulfillment(order: DemoOrder): void {
  const value = ensureFulfillment(order);
  value.phase = DemoFulfillmentPhase.fromWire(value.phase?.wire); value.incident = DemoIncidentKind.fromWire(value.incident?.wire);
  if (value.lastAction) value.lastAction = DemoFulfillmentAction.fromWire(value.lastAction.wire);
  if (!Number.isInteger(value.attempts) || value.attempts < 0 || ['recipient', 'phone', 'carrier', 'service', 'store', 'location', 'hours', 'pickupDeadline', 'incidentText', 'resolution'].some(key => typeof value[key as keyof DemoFulfillment] !== 'string')) throw new Error('El seguimiento guardado es inválido.');
  const pickup = order.delivery?.method === DemoDeliveryMethod.Pickup;
  if ((pickup && [DemoFulfillmentPhase.Transit, DemoFulfillmentPhase.Delivered].includes(value.phase)) || (!pickup && [DemoFulfillmentPhase.Ready, DemoFulfillmentPhase.Collected].includes(value.phase))) throw new Error('La modalidad no coincide con el seguimiento guardado.');
  if (value.phase !== DemoFulfillmentPhase.Unknown && ((value.phase.complete && order.shipment !== ShipmentStatus.Delivered) || (value.phase === DemoFulfillmentPhase.Preparing && order.shipment !== ShipmentStatus.Preparing) || ([DemoFulfillmentPhase.Transit, DemoFulfillmentPhase.Ready].includes(value.phase) && order.shipment !== ShipmentStatus.Shipped))) throw new Error('El estado de entrega no coincide con su historial.');
}
