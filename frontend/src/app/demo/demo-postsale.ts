import type { DemoOrder } from './demo-model';

export class DemoReturnReason {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Damaged = new DemoReturnReason('damaged', 'Llegó dañado');
  static readonly Wrong = new DemoReturnReason('wrong', 'Recibí otro producto');
  static readonly ChangedMind = new DemoReturnReason('changed-mind', 'Me arrepentí de la compra');
  static readonly Defective = new DemoReturnReason('defective', 'No funciona correctamente');
  static readonly Unknown = new DemoReturnReason('', 'Motivo desconocido');
  static readonly all = [this.Damaged, this.Wrong, this.ChangedMind, this.Defective];
  static fromWire(raw: unknown): DemoReturnReason { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoReturnStatus {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Requested = new DemoReturnStatus('requested', 'Solicitud enviada');
  static readonly Approved = new DemoReturnStatus('approved', 'Aprobada · esperamos los productos');
  static readonly Rejected = new DemoReturnStatus('rejected', 'Solicitud rechazada');
  static readonly Inspected = new DemoReturnStatus('inspected', 'Inspeccionada · reintegro pendiente');
  static readonly Refunded = new DemoReturnStatus('refunded', 'Reembolso simulado completado');
  static readonly Legacy = new DemoReturnStatus('legacy', 'Devolución histórica · requiere conciliación');
  static readonly Unknown = new DemoReturnStatus('', 'Estado desconocido · requiere recuperación');
  static fromWire(raw: unknown): DemoReturnStatus { return [this.Requested, this.Approved, this.Rejected, this.Inspected, this.Refunded, this.Legacy].find(value => value.wire === raw) ?? this.Unknown; }
  get reservesQuantity(): boolean { return this !== DemoReturnStatus.Rejected; }
}
export class DemoReturnDisposition {
  private constructor(readonly wire: string, readonly label: string, readonly restock: boolean) {}
  static readonly Sellable = new DemoReturnDisposition('sellable', 'Apto para reponer stock', true);
  static readonly Quarantine = new DemoReturnDisposition('quarantine', 'Dañado · mantener fuera del stock', false);
  static readonly Unknown = new DemoReturnDisposition('', 'Pendiente de inspección', false);
  static readonly all = [this.Sellable, this.Quarantine];
  static fromWire(raw: unknown): DemoReturnDisposition { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export interface DemoReturnLine { variantId: string; name: string; quantity: number; reason: DemoReturnReason; refund: number; disposition: DemoReturnDisposition; }
export interface DemoReturnRequest { id: string; command: string; status: DemoReturnStatus; lines: DemoReturnLine[]; created: string; note: string; refundId?: string; }
export interface DemoPostSaleAlert { id: string; orderId: string; actor: string; text: string; created: string; }
export interface DemoReturnSelection { variantId: string; quantity: number; reason: DemoReturnReason; }

/** Refund allocation uses the immutable paid line snapshot, never current catalog prices.
 * Partial returns allocate floor cents per item and assign the residue to earliest units.
 * Delivery is excluded: it was a separate service, visibly retained on the receipt. */
export class DemoRefundAllocation {
  amount(lineTotal: number, bought: number, prior: number, quantity: number): number {
    const base = Math.floor(lineTotal / bought), residue = lineTotal % bought;
    return base * quantity + Math.max(0, Math.min(prior + quantity, residue) - Math.min(prior, residue));
  }
}
export class DemoReturnPolicy {
  available(order: DemoOrder, variantId: string): number {
    const line = order.lines.find(value => value.variantId === variantId);
    return line ? line.quantity - (order.returns ?? []).filter(request => request.status.reservesQuantity).flatMap(request => request.lines).filter(value => value.variantId === variantId).reduce((sum, value) => sum + value.quantity, 0) : 0;
  }
  refunded(order: DemoOrder): number { return (order.returns ?? []).filter(value => value.status === DemoReturnStatus.Refunded).flatMap(value => value.lines).reduce((sum, value) => sum + value.refund, 0); }
}
/** Each transition has one responsibility; coordinator owns ordering, never HTTP/UI. */
export class DemoReturnDecision {
  apply(request: DemoReturnRequest, approve: boolean, note: string): boolean {
    const target = approve ? DemoReturnStatus.Approved : DemoReturnStatus.Rejected;
    if (request.status === target && request.note === note.trim()) return false;
    if (request.status !== DemoReturnStatus.Requested || !note.trim()) throw new Error('Indicá el motivo de la decisión para una solicitud pendiente.');
    request.status = target; request.note = note.trim(); return true;
  }
}
export class DemoReturnInspection {
  apply(request: DemoReturnRequest, outcomes: { variantId: string; disposition: DemoReturnDisposition }[]): boolean {
    const valid = outcomes.length === request.lines.length && new Set(outcomes.map(value => value.variantId)).size === outcomes.length && request.lines.every(line => outcomes.some(value => value.variantId === line.variantId && DemoReturnDisposition.all.includes(value.disposition)));
    if (!valid) throw new Error('Inspeccioná cada producto y elegí su destino.');
    if (request.status === DemoReturnStatus.Inspected || request.status === DemoReturnStatus.Refunded) {
      if (request.lines.every(line => outcomes.find(value => value.variantId === line.variantId)?.disposition === line.disposition)) return false;
      throw new Error('La inspección ya fue registrada.');
    }
    if (request.status !== DemoReturnStatus.Approved) throw new Error('Aprobá la solicitud antes de recibir e inspeccionar.');
    for (const line of request.lines) line.disposition = outcomes.find(value => value.variantId === line.variantId)!.disposition;
    request.status = DemoReturnStatus.Inspected; return true;
  }
}
export class DemoReturnRefund {
  apply(order: DemoOrder, request: DemoReturnRequest): boolean {
    if (request.status === DemoReturnStatus.Refunded) return false;
    const amount = request.lines.reduce((sum, line) => sum + line.refund, 0);
    if (request.status !== DemoReturnStatus.Inspected || amount + new DemoReturnPolicy().refunded(order) > order.total) throw new Error('El reintegro necesita inspección y no puede superar lo pagado.');
    request.status = DemoReturnStatus.Refunded; request.refundId = `SIM-REFUND-${request.id}`; return true;
  }
}

export function decodePostSale(order: DemoOrder): void {
  if (order.total !== order.lines.reduce((sum, line) => sum + line.unit * line.quantity, 0) + (order.delivery?.cost ?? 0)) throw new Error('El importe histórico no coincide con los productos y la entrega pagados.');
  if (!Array.isArray(order.returns ?? [])) throw new Error('Las devoluciones guardadas son inválidas.');
  order.returns ??= [];
  if (order.returned && order.returns.length === 0) order.returns.push({ id: `legacy-${order.id}`, command: `legacy-${order.id}`, status: DemoReturnStatus.Legacy, created: '', note: 'La recepción histórica no acredita inspección ni reembolso. Requiere conciliación.', lines: order.lines.map(line => ({ variantId: line.variantId!, name: line.name, quantity: line.quantity, reason: DemoReturnReason.Unknown, refund: line.unit * line.quantity, disposition: DemoReturnDisposition.Unknown })) });
  for (const request of order.returns) {
    request.status = DemoReturnStatus.fromWire(request.status?.wire);
    if (!request.id || !request.command || typeof request.created !== 'string' || typeof request.note !== 'string' || !Array.isArray(request.lines) || !request.lines.length || new Set(request.lines.map(line => line.variantId)).size !== request.lines.length) throw new Error('La solicitud guardada es inválida.');
    for (const line of request.lines) {
      line.reason = DemoReturnReason.fromWire(line.reason?.wire); line.disposition = DemoReturnDisposition.fromWire(line.disposition?.wire);
      const bought = order.lines.find(value => value.variantId === line.variantId);
      if (!bought || typeof line.name !== 'string' || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > bought.quantity || !Number.isSafeInteger(line.refund) || line.refund < 0 || line.refund !== bought.unit * line.quantity) throw new Error('Las cantidades o el dinero de la devolución son inválidos.');
      if ((request.status === DemoReturnStatus.Inspected || request.status === DemoReturnStatus.Refunded) && line.disposition === DemoReturnDisposition.Unknown) throw new Error('La inspección guardada está incompleta.');
      if ((request.status === DemoReturnStatus.Requested || request.status === DemoReturnStatus.Approved || request.status === DemoReturnStatus.Rejected) && line.disposition !== DemoReturnDisposition.Unknown) throw new Error('La inspección guardada no coincide con el estado.');
    }
    if (request.status === DemoReturnStatus.Refunded && request.refundId !== `SIM-REFUND-${request.id}`) throw new Error('El comprobante de reintegro guardado es inválido.');
  }
  if (new Set(order.returns.map(value => value.id)).size !== order.returns.length || new Set(order.returns.map(value => value.command)).size !== order.returns.length || order.lines.some(line => new DemoReturnPolicy().available(order, line.variantId!) < 0) || new DemoReturnPolicy().refunded(order) > order.total) throw new Error('La devolución acumulada supera lo comprado o pagado.');
}
