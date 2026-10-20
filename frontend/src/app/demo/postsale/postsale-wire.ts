import type { DemoPostSaleOrder } from './postsale-types';
import { DemoReturnAccounting, DemoReturnDisposition, DemoReturnInspectionResult, DemoReturnReason, DemoReturnStatus, type DemoReturnRequest } from './postsale-types';
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
    if (new Set(request.lines.map(line => line.variantId)).size !== request.lines.length || request.lines.some(line => !line.sku || !line.variantId || !line.name || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.refund) || line.refund < 0)) throw new Error('Las líneas guardadas son inválidas.');
    return request;
  }

  static validateOrder(order: DemoPostSaleOrder, returns: readonly DemoReturnRequest[]): void {
    const own = returns.filter(request => request.orderId === order.id);
    if (new Set(own.map(request => request.id)).size !== own.length || new Set(own.map(request => request.command)).size !== own.length) throw new Error('Hay operaciones de devolución duplicadas.');
    const policy = new DemoReturnPolicy();
    if (order.lines.some(line => policy.available(order, own, line.variantId) < 0) || policy.refunded(order, own) > policy.merchandiseTotal(order)) throw new Error('La devolución acumulada supera lo comprado o pagado.');
    for (const request of own) {
      if (request.actorId !== order.actor || request.lines.some(line => !order.lines.some(bought => bought.sku === line.sku && bought.variantId === line.variantId && line.quantity <= bought.quantity && line.refund === bought.unit * line.quantity))) throw new Error('La devolución no pertenece al pedido o altera su cantidad/dinero guardado.');
      const refunded = request.lines.reduce((sum, line) => sum + line.refund, 0);
      if (request.refundedAmount !== (request.status === DemoReturnStatus.Refunded ? refunded : 0)) throw new Error('El importe reembolsado guardado es inválido.');
      if (request.status === DemoReturnStatus.Refunded && request.refundId !== `SIM-REFUND-${request.id}`) throw new Error('El comprobante guardado es inválido.');
      if ([DemoReturnStatus.Disposed, DemoReturnStatus.Refunded].includes(request.status) && request.lines.some(line => !DemoReturnDisposition.all.includes(line.disposition) || !DemoReturnAccounting.all.includes(line.accounting))) throw new Error('La disposición guardada está incompleta.');
    }
  }
}
