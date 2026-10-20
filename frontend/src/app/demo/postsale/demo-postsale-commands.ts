import { PaymentStatus } from '../../domain/order/payment-status';
import { ShipmentStatus } from '../../domain/order/shipment-status';
import { DemoCatalogQuery } from '../catalog/demo-catalog-query';
import { DemoProductPolicy } from '../catalog/product-policy';
import type { DemoCheckoutSnapshot } from '../checkout/checkout-model';
import { DemoRefundAllocation } from './refund-allocation';
import { DemoReturnPolicy } from './return-policy';
import { DemoReturnDecision, DemoReturnDisposal, DemoReturnInspection, DemoReturnReception } from './return-transitions';
import { DemoPostSaleEventKind, DemoReturnAccounting, DemoReturnDisposition, DemoReturnInspectionResult, DemoReturnReason, DemoReturnStatus, demoReturnLineKey, type DemoPostSaleAlert, type DemoPostSaleOrder, type DemoReturnRequest, type DemoReturnSelection } from './postsale-types';

export interface DemoPostSaleSnapshot extends Omit<DemoCheckoutSnapshot, 'orders'> {
  orders: DemoPostSaleOrder[];
  returns: DemoReturnRequest[];
  postSaleAlerts: DemoPostSaleAlert[];
}
export interface DemoPostSalePort {
  readonly catalog: DemoCatalogQuery;
  snapshot(): DemoPostSaleSnapshot;
  requireCustomerAccess(actorId: string): void;
  requireAdminAccess(actorId: string): void;
  commit(projectStock?: boolean): void;
  now(): string;
  id(): string;
}

/** Coordinates explicit post-sale step objects; it owns no UI, HTTP or persistence format. */
export class DemoPostSaleCommands {
  private readonly policy = new DemoReturnPolicy();
  constructor(private readonly port: DemoPostSalePort) {}

  request(actorId: string, command: string, orderId: string, selections: readonly DemoReturnSelection[]): DemoReturnRequest {
    this.port.requireCustomerAccess(actorId);
    const snapshot = this.port.snapshot();
    const order = snapshot.orders.find(value => value.id === orderId && value.actor === actorId);
    if (!order || order.payment !== PaymentStatus.Approved || order.shipment !== ShipmentStatus.Delivered) throw new Error('La devolución requiere un pedido propio, pagado y entregado.');
    const normalizedCommand = command.trim();
    const repeated = snapshot.returns.find(value => value.orderId === orderId && value.command === normalizedCommand);
    if (repeated) {
      const same = repeated.lines.length === selections.length && repeated.lines.every(line => selections.some(selection => demoReturnLineKey(selection) === demoReturnLineKey(line) && selection.quantity === line.quantity && selection.reason === line.reason));
      if (!same) throw new Error('Esta operación ya existe con otros datos.');
      return repeated;
    }
    if (snapshot.returns.some(value => value.orderId === orderId && (value.status === DemoReturnStatus.Unknown || value.lines.some(line => line.reason === DemoReturnReason.Unknown)))) throw new Error('La postventa guardada necesita conciliación antes de continuar.');
    if (!normalizedCommand || !selections.length || new Set(selections.map(demoReturnLineKey)).size !== selections.length || selections.some(value => !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > this.policy.available(order, snapshot.returns, value.sku, value.variantId) || !DemoReturnReason.all.includes(value.reason))) throw new Error('Seleccioná productos, cantidades disponibles y un motivo por producto.');
    const request: DemoReturnRequest = {
      id: `RMA-${this.port.id()}`,
      command: normalizedCommand,
      orderId,
      actorId,
      status: DemoReturnStatus.Requested,
      requestedAt: this.port.now(),
      decisionReason: '',
      inspectionNotes: '',
      inspectionResult: DemoReturnInspectionResult.Unknown,
      refundedAmount: 0,
      history: [`Solicitud creada · ${this.port.now()}`],
      lines: selections.map(selection => {
        const bought = order.lines.find(line => demoReturnLineKey(line) === demoReturnLineKey(selection))!;
        const prior = bought.quantity - this.policy.available(order, snapshot.returns, selection.sku, selection.variantId);
        return { sku: bought.sku, variantId: bought.variantId, name: bought.name, quantity: selection.quantity, refund: new DemoRefundAllocation().amount(bought.unit * bought.quantity, bought.quantity, prior, selection.quantity), reason: selection.reason, disposition: DemoReturnDisposition.Pending, accounting: DemoReturnAccounting.NotRecorded };
      }),
    };
    snapshot.returns.push(request);
    this.record(order, request, DemoPostSaleEventKind.Requested, request.status.label);
    return request;
  }

  cancel(actorId: string, requestId: string): void {
    this.port.requireCustomerAccess(actorId);
    const { order, request } = this.find(requestId);
    if (request.actorId !== actorId) throw new Error('Solo el comprador del pedido puede cancelar su solicitud.');
    if (request.status === DemoReturnStatus.Cancelled) return;
    if (request.status !== DemoReturnStatus.Requested) throw new Error('La solicitud ya fue procesada; no se puede cancelar.');
    request.status = DemoReturnStatus.Cancelled;
    this.record(order, request, DemoPostSaleEventKind.Cancelled, request.status.label);
  }

  decide(adminId: string, requestId: string, approve: boolean, reason: string): void {
    this.port.requireAdminAccess(adminId);
    const { order, request } = this.find(requestId);
    if (new DemoReturnDecision().apply(request, approve, reason)) this.record(order, request, DemoPostSaleEventKind.Decided, `${request.status.label}: ${request.decisionReason}`);
  }

  receive(adminId: string, requestId: string): void {
    this.port.requireAdminAccess(adminId);
    const { order, request } = this.find(requestId);
    if (new DemoReturnReception().apply(request)) this.record(order, request, DemoPostSaleEventKind.Received, request.status.label);
  }

  inspect(adminId: string, requestId: string, notes: string, result: DemoReturnInspectionResult): void {
    this.port.requireAdminAccess(adminId);
    const { order, request } = this.find(requestId);
    if (new DemoReturnInspection().apply(request, notes, result)) this.record(order, request, DemoPostSaleEventKind.Inspected, `${result.label}: ${request.inspectionNotes}`);
  }

  dispose(adminId: string, requestId: string, outcomes: readonly { sku: string; variantId: string; disposition: DemoReturnDisposition }[]): void {
    this.port.requireAdminAccess(adminId);
    const snapshot = this.port.snapshot();
    const { order, request } = this.find(requestId);
    const dispositions = new Map(outcomes.map(value => [demoReturnLineKey(value), value.disposition]));
    const disposal = new DemoReturnDisposal();
    if (!disposal.requiresMutation(request, dispositions)) return;
    const inventory = request.lines.map(line => ({ line, product: this.port.catalog.product(line.sku), variant: this.port.catalog.variant(line.sku, line.variantId) }));
    if (inventory.some(({ product, variant }) => !DemoProductPolicy.knownProduct(product) || !DemoProductPolicy.knownVariant(variant))) throw new Error('El producto o la variante necesitan conciliación antes de disponer inventario.');
    disposal.apply(request, dispositions);
    for (const { line, product, variant } of inventory) {
      variant.onHand += line.quantity;
      if (line.disposition === DemoReturnDisposition.Damaged) variant.notSellable += line.quantity;
      line.accounting = line.disposition === DemoReturnDisposition.Restock ? DemoReturnAccounting.Sellable : DemoReturnAccounting.Damaged;
      this.port.catalog.refreshTotals(product);
      snapshot.movements.push({ id: `${request.id}-${line.sku}-${line.variantId}`, sku: line.sku, variantId: line.variantId, delta: line.quantity, reason: `${line.disposition.label} · ${request.id}` });
    }
    this.record(order, request, DemoPostSaleEventKind.Disposed, request.status.label, true);
  }

  refund(adminId: string, requestId: string): void {
    this.port.requireAdminAccess(adminId);
    const snapshot = this.port.snapshot();
    const { order, request } = this.find(requestId);
    if (request.status === DemoReturnStatus.Refunded) return;
    const amount = request.lines.reduce((sum, line) => sum + line.refund, 0);
    if (order.payment !== PaymentStatus.Approved || request.status !== DemoReturnStatus.Disposed || amount + this.policy.refunded(order, snapshot.returns) > this.policy.merchandiseTotal(order)) throw new Error('El reintegro requiere pago aprobado, disposición y no puede superar lo pagado por productos.');
    request.status = DemoReturnStatus.Refunded;
    request.refundedAmount = amount;
    request.refundId = `SIM-REFUND-${request.id}`;
    this.record(order, request, DemoPostSaleEventKind.Refunded, `${request.status.label} · ${request.refundId}`);
  }

  private find(requestId: string): { order: DemoPostSaleOrder; request: DemoReturnRequest } {
    const snapshot = this.port.snapshot();
    const request = snapshot.returns.find(value => value.id === requestId);
    const order = request ? snapshot.orders.find(value => value.id === request.orderId) : undefined;
    if (!request || !order || request.status === DemoReturnStatus.Unknown || request.lines.some(line => line.reason === DemoReturnReason.Unknown)) throw new Error('Devolución no disponible.');
    return { order, request };
  }

  private record(order: DemoPostSaleOrder, request: DemoReturnRequest, event: DemoPostSaleEventKind, text: string, projectStock = false): void {
    const snapshot = this.port.snapshot();
    const createdAt = this.port.now();
    const eventRevision = snapshot.revision + 1;
    request.history.push(`${text} · ${createdAt}`);
    order.history.push(`${text} · ${createdAt}`);
    snapshot.postSaleAlerts.push({ id: event.identity(request.id, eventRevision), orderId: order.id, actorId: order.actor, text, createdAt });
    this.port.commit(projectStock);
  }
}
