import type { DemoOrder } from '../checkout/checkout-model';

export class DemoReturnReason {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Damaged = new DemoReturnReason('damaged', 'Llegó dañado');
  static readonly WrongProduct = new DemoReturnReason('wrong-product', 'Recibí otro producto');
  static readonly ChangedMind = new DemoReturnReason('changed-mind', 'Me arrepentí de la compra');
  static readonly Defective = new DemoReturnReason('defective', 'No funciona correctamente');
  static readonly Unknown = new DemoReturnReason('', 'Motivo desconocido');
  static readonly all = [this.Damaged, this.WrongProduct, this.ChangedMind, this.Defective] as const;
  static fromWire(raw: unknown): DemoReturnReason { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class DemoReturnStatus {
  private constructor(readonly wire: string, readonly label: string, readonly reservesQuantity: boolean) {}
  static readonly Requested = new DemoReturnStatus('requested', 'Solicitada', true);
  static readonly Approved = new DemoReturnStatus('approved', 'Aprobada', true);
  static readonly Rejected = new DemoReturnStatus('rejected', 'Rechazada', false);
  static readonly Received = new DemoReturnStatus('received', 'Recibida', true);
  static readonly Inspected = new DemoReturnStatus('inspected', 'Inspeccionada', true);
  static readonly Disposed = new DemoReturnStatus('disposed', 'Disposición registrada', true);
  static readonly Refunded = new DemoReturnStatus('refunded', 'Reembolso simulado', true);
  static readonly Cancelled = new DemoReturnStatus('cancelled', 'Cancelada', false);
  static readonly Unknown = new DemoReturnStatus('', 'Estado desconocido', true);
  static readonly all = [this.Requested, this.Approved, this.Rejected, this.Received, this.Inspected, this.Disposed, this.Refunded, this.Cancelled] as const;
  static fromWire(raw: unknown): DemoReturnStatus { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class DemoReturnInspectionResult {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Complete = new DemoReturnInspectionResult('complete', 'Inspección completa');
  static readonly NeedsReview = new DemoReturnInspectionResult('needs-review', 'Requiere revisión adicional');
  static readonly Unknown = new DemoReturnInspectionResult('', 'Resultado desconocido');
  static readonly all = [this.Complete, this.NeedsReview] as const;
  static fromWire(raw: unknown): DemoReturnInspectionResult { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class DemoReturnDisposition {
  private constructor(readonly wire: string, readonly label: string, readonly sellable: boolean) {}
  static readonly Restock = new DemoReturnDisposition('restock', 'Apta para volver al stock', true);
  static readonly Damaged = new DemoReturnDisposition('damaged', 'No apta para venta', false);
  static readonly Pending = new DemoReturnDisposition('pending', 'Pendiente de disposición', false);
  static readonly Unknown = new DemoReturnDisposition('', 'Disposición desconocida', false);
  static readonly all = [this.Restock, this.Damaged] as const;
  static fromWire(raw: unknown): DemoReturnDisposition {
    return [this.Pending, ...this.all].find(value => value.wire === raw) ?? this.Unknown;
  }
}

export class DemoReturnAccounting {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly NotRecorded = new DemoReturnAccounting('not-recorded', 'Sin efecto de inventario');
  static readonly Sellable = new DemoReturnAccounting('sellable', 'Reintegrada a disponible');
  static readonly Damaged = new DemoReturnAccounting('damaged', 'Ingresada como no vendible');
  static readonly Unknown = new DemoReturnAccounting('', 'Contabilidad desconocida');
  static readonly all = [this.NotRecorded, this.Sellable, this.Damaged] as const;
  static fromWire(raw: unknown): DemoReturnAccounting { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

/** Closed discriminator for durable post-sale events; status alone is not an event identity. */
export class DemoPostSaleEventKind {
  private constructor(readonly wire: string) {}
  static readonly Requested = new DemoPostSaleEventKind('requested');
  static readonly Cancelled = new DemoPostSaleEventKind('cancelled');
  static readonly Decided = new DemoPostSaleEventKind('decided');
  static readonly Received = new DemoPostSaleEventKind('received');
  static readonly Inspected = new DemoPostSaleEventKind('inspected');
  static readonly Disposed = new DemoPostSaleEventKind('disposed');
  static readonly Refunded = new DemoPostSaleEventKind('refunded');
  static readonly Unknown = new DemoPostSaleEventKind('');
  static readonly all = [this.Requested, this.Cancelled, this.Decided, this.Received, this.Inspected, this.Disposed, this.Refunded] as const;
  static fromWire(raw: unknown): DemoPostSaleEventKind { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  identity(requestId: string, effectiveRevision: number): string {
    if (this === DemoPostSaleEventKind.Unknown || !requestId || !Number.isSafeInteger(effectiveRevision) || effectiveRevision < 1) throw new Error('El evento de postventa no tiene una identidad válida.');
    return `${requestId}-${this.wire}-${effectiveRevision}`;
  }
}

export class DemoRefundStatus {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly None = new DemoRefundStatus('none', 'Sin reembolso');
  static readonly PartiallyRefunded = new DemoRefundStatus('partially-refunded', 'Reembolso parcial');
  static readonly FullyRefunded = new DemoRefundStatus('fully-refunded', 'Reembolso total');
  static readonly Unknown = new DemoRefundStatus('', 'Estado de reembolso desconocido');
  static readonly all = [this.None, this.PartiallyRefunded, this.FullyRefunded] as const;
  static fromWire(raw: unknown): DemoRefundStatus { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  static fromAmounts(refunded: number, merchandise: number): DemoRefundStatus {
    if (!Number.isSafeInteger(refunded) || !Number.isSafeInteger(merchandise) || refunded < 0 || merchandise <= 0 || refunded > merchandise) return this.Unknown;
    if (refunded === 0) return this.None;
    return refunded === merchandise ? this.FullyRefunded : this.PartiallyRefunded;
  }
}

export class DemoReturnQueueFilter {
  private constructor(readonly wire: string, readonly label: string, readonly matches: (status: DemoReturnStatus) => boolean) {}
  static readonly All = new DemoReturnQueueFilter('all', 'Todas', () => true);
  static readonly Pending = new DemoReturnQueueFilter('pending', 'Pendientes', status => [DemoReturnStatus.Requested, DemoReturnStatus.Approved, DemoReturnStatus.Received, DemoReturnStatus.Inspected, DemoReturnStatus.Disposed].includes(status));
  static readonly Closed = new DemoReturnQueueFilter('closed', 'Finalizadas', status => [DemoReturnStatus.Rejected, DemoReturnStatus.Cancelled, DemoReturnStatus.Refunded].includes(status));
  static readonly Unknown = new DemoReturnQueueFilter('', 'Filtro desconocido', () => false);
  static readonly all = [this.All, this.Pending, this.Closed] as const;
  static fromWire(raw: unknown): DemoReturnQueueFilter { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export interface DemoReturnSelection { sku: string; variantId: string; quantity: number; reason: DemoReturnReason; }
export interface DemoReturnLine { sku: string; variantId: string; name: string; quantity: number; refund: number; reason: DemoReturnReason; disposition: DemoReturnDisposition; accounting: DemoReturnAccounting; }
export interface DemoReturnRequest {
  id: string;
  command: string;
  orderId: string;
  actorId: string;
  status: DemoReturnStatus;
  lines: DemoReturnLine[];
  requestedAt: string;
  decisionReason: string;
  inspectionNotes: string;
  inspectionResult: DemoReturnInspectionResult;
  history: string[];
  refundedAmount: number;
  refundId?: string;
}
export interface DemoPostSaleAlert { id: string; orderId: string; actorId: string; text: string; createdAt: string; }
export interface DemoPostSaleOrder extends DemoOrder { returns?: DemoReturnRequest[]; }

/** Product and variant are jointly authoritative; neither value is globally unique on its own. */
export function demoReturnLineKey(value: { sku: string; variantId: string }): string {
  return `${value.sku}\u0000${value.variantId}`;
}
