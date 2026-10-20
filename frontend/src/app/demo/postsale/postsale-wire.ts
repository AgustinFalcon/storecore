import type { DemoPostSaleOrder } from './postsale-types';
import { DemoReturnAccounting, DemoReturnDisposition, DemoReturnInspectionResult, DemoReturnReason, DemoReturnStatus, demoReturnLineKey, type DemoReturnRequest } from './postsale-types';
import { DemoReturnPolicy } from './return-policy';

const wire = (raw: unknown): unknown => raw !== null && typeof raw === 'object' && 'wire' in raw ? raw.wire : raw;

/** The sole post-sale persistence boundary. Unknown values are retained fail-closed. */
export class DemoPostSaleWire {
  static request(raw: unknown): DemoReturnRequest {
    if (!raw || typeof raw !== 'object') throw new Error('La solicitud guardada es inválida.');
    const source = raw as DemoReturnRequest;
    if (!source.id || !source.command || !source.orderId || !source.actorId || typeof source.requestedAt !== 'string' || typeof source.decisionReason !== 'string' || typeof source.inspectionNotes !== 'string' || !Array.isArray(source.history) || !Array.isArray(source.lines) || !source.lines.length || !Number.isSafeInteger(source.refundedAmount) || source.refundedAmount < 0) throw new Error('La solicitud guardada es inválida.');
    const request: DemoReturnRequest = {
      ...source,
      status: DemoReturnStatus.fromWire(wire(source.status)),
      inspectionResult: DemoReturnInspectionResult.fromWire(wire(source.inspectionResult)),
      lines: source.lines.map(line => ({
        ...line,
        reason: DemoReturnReason.fromWire(wire(line.reason)),
        disposition: DemoReturnDisposition.fromWire(wire(line.disposition)),
        accounting: DemoReturnAccounting.fromWire(wire(line.accounting)),
      })),
    };
    if (new Set(request.lines.map(demoReturnLineKey)).size !== request.lines.length || request.lines.some(line => !line.sku || !line.variantId || !line.name || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.refund) || line.refund < 0)) throw new Error('Las líneas guardadas son inválidas.');
    return request;
  }

  static validateOrder(order: DemoPostSaleOrder, returns: readonly DemoReturnRequest[]): void {
    const own = returns.filter(request => request.orderId === order.id);
    if (new Set(own.map(request => request.id)).size !== own.length || new Set(own.map(request => request.command)).size !== own.length) throw new Error('Hay operaciones de devolución duplicadas.');
    const policy = new DemoReturnPolicy();
    if (order.lines.some(line => policy.available(order, own, line.sku, line.variantId) < 0) || policy.refunded(order, own) > policy.merchandiseTotal(order)) throw new Error('La devolución acumulada supera lo comprado o pagado.');
    for (const request of own) {
      if (request.actorId !== order.actor || request.lines.some(line => !order.lines.some(bought => demoReturnLineKey(bought) === demoReturnLineKey(line) && line.quantity <= bought.quantity && line.refund === bought.unit * line.quantity))) throw new Error('La devolución no pertenece al pedido o altera su cantidad/dinero guardado.');
      const refunded = request.lines.reduce((sum, line) => sum + line.refund, 0);
      if (request.refundedAmount !== (request.status === DemoReturnStatus.Refunded ? refunded : 0)) throw new Error('El importe reembolsado guardado es inválido.');
      if (request.status === DemoReturnStatus.Refunded ? request.refundId !== `SIM-REFUND-${request.id}` : request.refundId !== undefined) throw new Error('El comprobante guardado es inválido.');
      const beforeInspection = [DemoReturnStatus.Requested, DemoReturnStatus.Approved, DemoReturnStatus.Rejected, DemoReturnStatus.Cancelled];
      if (beforeInspection.includes(request.status) && (request.inspectionResult !== DemoReturnInspectionResult.Unknown || request.inspectionNotes !== '')) throw new Error('La inspección guardada no coincide con el estado.');
      if (request.status === DemoReturnStatus.Received && !((request.inspectionResult === DemoReturnInspectionResult.Unknown && request.inspectionNotes === '') || (request.inspectionResult === DemoReturnInspectionResult.NeedsReview && !!request.inspectionNotes))) throw new Error('La recepción guardada tiene una inspección incompatible.');
      if ([DemoReturnStatus.Inspected, DemoReturnStatus.Disposed, DemoReturnStatus.Refunded].includes(request.status) && (request.inspectionResult !== DemoReturnInspectionResult.Complete || !request.inspectionNotes)) throw new Error('La inspección completa guardada es inválida.');
      const disposed = [DemoReturnStatus.Disposed, DemoReturnStatus.Refunded].includes(request.status);
      const accountingCompatible = request.lines.every(line => disposed
        ? (line.disposition === DemoReturnDisposition.Restock && line.accounting === DemoReturnAccounting.Sellable) || (line.disposition === DemoReturnDisposition.Damaged && line.accounting === DemoReturnAccounting.Damaged)
        : line.disposition === DemoReturnDisposition.Pending && line.accounting === DemoReturnAccounting.NotRecorded);
      if (!accountingCompatible) throw new Error('La disposición y su contabilidad no coinciden con el estado guardado.');
    }
  }
}
