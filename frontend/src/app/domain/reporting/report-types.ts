class ClosedWireValue {
  protected constructor(readonly wire: string, readonly label: string) {}
}

export class ReportAvailability extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Available = new ReportAvailability('AVAILABLE', 'Disponible');
  static readonly Unavailable = new ReportAvailability('UNAVAILABLE', 'Sin evidencia disponible');
  static readonly NotAvailable = new ReportAvailability('NOT_AVAILABLE', 'No modelado');
  static readonly Unknown = new ReportAvailability('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Available, this.Unavailable, this.NotAvailable]);
  static fromWire(raw: unknown): ReportAvailability { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ReportSource extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly StoreCoreOrder = new ReportSource('STORECORE_ORDER', 'Pedidos StoreCore');
  static readonly StoreCorePaymentApplication = new ReportSource('STORECORE_PAYMENT_APPLICATION', 'Acreditaciones StoreCore');
  static readonly StoreCoreInventoryLedger = new ReportSource('STORECORE_INVENTORY_LEDGER', 'Movimientos de inventario');
  static readonly StoreCoreReturn = new ReportSource('STORECORE_RETURN', 'Devoluciones StoreCore');
  static readonly StoreCoreCurrentInventory = new ReportSource('STORECORE_CURRENT_INVENTORY', 'Inventario actual StoreCore');
  static readonly BlackStoreStockSaga = new ReportSource('BLACKSTORE_STOCK_SAGA', 'Integración de stock BlackStore');
  static readonly Unknown = new ReportSource('UNKNOWN', 'Fuente desconocida');
  static readonly all = Object.freeze([this.StoreCoreOrder, this.StoreCorePaymentApplication, this.StoreCoreInventoryLedger, this.StoreCoreReturn, this.StoreCoreCurrentInventory, this.BlackStoreStockSaga]);
  static fromWire(raw: unknown): ReportSource { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ReportTimeBasis extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly OrderCreated = new ReportTimeBasis('ORDER_CREATED', 'Creación del pedido');
  static readonly PaymentApplied = new ReportTimeBasis('PAYMENT_APPLIED', 'Acreditación aplicada');
  static readonly LedgerRecorded = new ReportTimeBasis('LEDGER_RECORDED', 'Movimiento registrado');
  static readonly ReturnReceived = new ReportTimeBasis('RETURN_RECEIVED', 'Devolución recibida');
  static readonly DispositionConfirmed = new ReportTimeBasis('DISPOSITION_CONFIRMED', 'Disposición confirmada');
  static readonly CurrentSnapshot = new ReportTimeBasis('CURRENT_SNAPSHOT', 'Observación actual');
  static readonly Unknown = new ReportTimeBasis('UNKNOWN', 'Base temporal desconocida');
  static readonly all = Object.freeze([this.OrderCreated, this.PaymentApplied, this.LedgerRecorded, this.ReturnReceived, this.DispositionConfirmed, this.CurrentSnapshot]);
  static fromWire(raw: unknown): ReportTimeBasis { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ReportFreshness extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Current = new ReportFreshness('CURRENT', 'Actual');
  static readonly Stale = new ReportFreshness('STALE', 'Desactualizado');
  static readonly Unavailable = new ReportFreshness('UNAVAILABLE', 'No disponible');
  static readonly Unknown = new ReportFreshness('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Current, this.Stale, this.Unavailable]);
  static fromWire(raw: unknown): ReportFreshness { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ReportUnavailableReason extends ClosedWireValue {
  private constructor(wire: string, label: string, readonly availability: ReportAvailability | null) { super(wire, label); }
  static readonly NoEvidence = new ReportUnavailableReason('NO_EVIDENCE', 'No existe evidencia autoritativa', ReportAvailability.Unavailable);
  static readonly SourceDisabled = new ReportUnavailableReason('SOURCE_DISABLED', 'Fuente deshabilitada', ReportAvailability.Unavailable);
  static readonly SourceMissing = new ReportUnavailableReason('SOURCE_MISSING', 'Fuente ausente', ReportAvailability.Unavailable);
  static readonly SourceContradictory = new ReportUnavailableReason('SOURCE_CONTRADICTORY', 'Evidencia contradictoria', ReportAvailability.Unavailable);
  static readonly ReadFailed = new ReportUnavailableReason('READ_FAILED', 'No se pudo leer la fuente', ReportAvailability.Unavailable);
  static readonly ExpiredSnapshot = new ReportUnavailableReason('EXPIRED_SNAPSHOT', 'Observación vencida', ReportAvailability.Unavailable);
  static readonly UnsupportedHistory = new ReportUnavailableReason('UNSUPPORTED_HISTORY', 'Histórico no soportado', ReportAvailability.NotAvailable);
  static readonly UnsupportedContract = new ReportUnavailableReason('UNSUPPORTED_CONTRACT', 'Contrato no disponible', ReportAvailability.NotAvailable);
  static readonly UnsupportedVersion = new ReportUnavailableReason('UNSUPPORTED_VERSION', 'Versión no soportada', ReportAvailability.NotAvailable);
  static readonly ReversalAmountUnavailable = new ReportUnavailableReason('REVERSAL_AMOUNT_UNAVAILABLE', 'Importe de reversión no modelado', ReportAvailability.NotAvailable);
  static readonly ExternalCommercialFactsUnavailable = new ReportUnavailableReason('EXTERNAL_COMMERCIAL_FACTS_UNAVAILABLE', 'Hechos comerciales externos no modelados', ReportAvailability.NotAvailable);
  static readonly Unknown = new ReportUnavailableReason('UNKNOWN', 'Motivo desconocido', null);
  static readonly all = Object.freeze([this.NoEvidence, this.SourceDisabled, this.SourceMissing, this.SourceContradictory, this.ReadFailed, this.ExpiredSnapshot, this.UnsupportedHistory, this.UnsupportedContract, this.UnsupportedVersion, this.ReversalAmountUnavailable, this.ExternalCommercialFactsUnavailable]);
  static fromWire(raw: unknown): ReportUnavailableReason { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ReportPaymentDisposition extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Pending = new ReportPaymentDisposition('PENDING', 'Pendiente');
  static readonly Approved = new ReportPaymentDisposition('APPROVED', 'Aprobado');
  static readonly Rejected = new ReportPaymentDisposition('REJECTED', 'Rechazado');
  static readonly Cancelled = new ReportPaymentDisposition('CANCELLED', 'Cancelado');
  static readonly Refunded = new ReportPaymentDisposition('REFUNDED', 'Reintegrado');
  static readonly ChargedBack = new ReportPaymentDisposition('CHARGED_BACK', 'Contracargo');
  static readonly Unknown = new ReportPaymentDisposition('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Pending, this.Approved, this.Rejected, this.Cancelled, this.Refunded, this.ChargedBack]);
  static fromWire(raw: unknown): ReportPaymentDisposition { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ReportInventoryEventType extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Reservation = new ReportInventoryEventType('RESERVATION', 'Reserva');
  static readonly Release = new ReportInventoryEventType('RELEASE', 'Liberación');
  static readonly Sale = new ReportInventoryEventType('SALE', 'Venta');
  static readonly Refund = new ReportInventoryEventType('REFUND', 'Reintegro');
  static readonly ReturnReceived = new ReportInventoryEventType('RETURN_RECEIVED', 'Devolución recibida');
  static readonly Adjustment = new ReportInventoryEventType('ADJUSTMENT', 'Ajuste');
  static readonly Reconciliation = new ReportInventoryEventType('RECONCILIATION', 'Reconciliación');
  static readonly StockCommitExternal = new ReportInventoryEventType('STOCK_COMMIT_EXTERNAL', 'Confirmación externa');
  static readonly RmaRestock = new ReportInventoryEventType('RMA_RESTOCK', 'Reingreso RMA');
  static readonly Unknown = new ReportInventoryEventType('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Reservation, this.Release, this.Sale, this.Refund, this.ReturnReceived, this.Adjustment, this.Reconciliation, this.StockCommitExternal, this.RmaRestock]);
  static fromWire(raw: unknown): ReportInventoryEventType { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  accepts(channel: ReportInventoryChannel): boolean {
    if (this === ReportInventoryEventType.Sale) return channel === ReportInventoryChannel.Web || channel === ReportInventoryChannel.MercadoLibre;
    if (this === ReportInventoryEventType.StockCommitExternal) return channel === ReportInventoryChannel.ExternalBlackStore;
    if (this === ReportInventoryEventType.Reservation || this === ReportInventoryEventType.Release) return ReportInventoryChannel.all.includes(channel);
    if (this === ReportInventoryEventType.RmaRestock) return channel === ReportInventoryChannel.Internal;
    if (this === ReportInventoryEventType.Refund || this === ReportInventoryEventType.ReturnReceived || this === ReportInventoryEventType.Adjustment || this === ReportInventoryEventType.Reconciliation) {
      return channel === ReportInventoryChannel.Web || channel === ReportInventoryChannel.MercadoLibre || channel === ReportInventoryChannel.Internal;
    }
    return false;
  }
}

export class ReportInventoryChannel extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Web = new ReportInventoryChannel('WEB', 'Tienda web');
  static readonly MercadoLibre = new ReportInventoryChannel('MERCADO_LIBRE', 'Mercado Libre');
  static readonly Internal = new ReportInventoryChannel('INTERNAL', 'Operación interna');
  static readonly ExternalBlackStore = new ReportInventoryChannel('EXTERNAL_BLACKSTORE', 'BlackStore');
  static readonly Unknown = new ReportInventoryChannel('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Web, this.MercadoLibre, this.Internal, this.ExternalBlackStore]);
  static fromWire(raw: unknown): ReportInventoryChannel { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ReportModuleState extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Disabled = new ReportModuleState('DISABLED', 'Deshabilitado');
  static readonly ReadOnly = new ReportModuleState('READ_ONLY', 'Sólo lectura');
  static readonly Active = new ReportModuleState('ACTIVE', 'Activo');
  static readonly Paused = new ReportModuleState('PAUSED', 'Pausado');
  static readonly Error = new ReportModuleState('ERROR', 'Con error');
  static readonly Unknown = new ReportModuleState('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Disabled, this.ReadOnly, this.Active, this.Paused, this.Error]);
  static fromWire(raw: unknown): ReportModuleState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class BlackStoreRegistrationState extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Absent = new BlackStoreRegistrationState('ABSENT', 'Sin registrar');
  static readonly Disabled = new BlackStoreRegistrationState('DISABLED', 'Deshabilitado');
  static readonly Active = new BlackStoreRegistrationState('ACTIVE', 'Activo');
  static readonly RevokedOnly = new BlackStoreRegistrationState('REVOKED_ONLY', 'Sólo historial revocado');
  static readonly Unknown = new BlackStoreRegistrationState('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Absent, this.Disabled, this.Active, this.RevokedOnly]);
  static fromWire(raw: unknown): BlackStoreRegistrationState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class BlackStoreOperationState extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Pending = new BlackStoreOperationState('PENDING', 'Pendiente');
  static readonly Reserved = new BlackStoreOperationState('RESERVED', 'Reservada');
  static readonly Committed = new BlackStoreOperationState('COMMITTED', 'Confirmada');
  static readonly Released = new BlackStoreOperationState('RELEASED', 'Liberada');
  static readonly Expired = new BlackStoreOperationState('EXPIRED', 'Vencida');
  static readonly Unknown = new BlackStoreOperationState('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Pending, this.Reserved, this.Committed, this.Released, this.Expired]);
  static fromWire(raw: unknown): BlackStoreOperationState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class BlackStoreRetiredOperationState extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Committed = new BlackStoreRetiredOperationState('COMMITTED', 'Confirmada');
  static readonly Released = new BlackStoreRetiredOperationState('RELEASED', 'Liberada');
  static readonly Expired = new BlackStoreRetiredOperationState('EXPIRED', 'Vencida');
  static readonly Unknown = new BlackStoreRetiredOperationState('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Committed, this.Released, this.Expired]);
  static fromWire(raw: unknown): BlackStoreRetiredOperationState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ReportLoadState extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Unselected = new ReportLoadState('UNSELECTED', 'Elegí un período');
  static readonly Loading = new ReportLoadState('LOADING', 'Cargando');
  static readonly Refreshing = new ReportLoadState('REFRESHING', 'Actualizando');
  static readonly Ready = new ReportLoadState('READY', 'Disponible');
  static readonly Stale = new ReportLoadState('STALE', 'Desactualizado');
  static readonly Denied = new ReportLoadState('DENIED', 'Sin autorización');
  static readonly Invalid = new ReportLoadState('INVALID', 'Período inválido');
  static readonly Unavailable = new ReportLoadState('UNAVAILABLE', 'No disponible');
  static readonly Corrupt = new ReportLoadState('CORRUPT', 'Respuesta inválida');
  static readonly Unknown = new ReportLoadState('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Unselected, this.Loading, this.Refreshing, this.Ready, this.Stale, this.Denied, this.Invalid, this.Unavailable, this.Corrupt]);
  static fromWire(raw: unknown): ReportLoadState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ReportExportState extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly Idle = new ReportExportState('IDLE', 'Lista para exportar');
  static readonly Downloading = new ReportExportState('DOWNLOADING', 'Preparando descarga');
  static readonly Completed = new ReportExportState('COMPLETED', 'Descarga solicitada');
  static readonly Stale = new ReportExportState('STALE', 'El período cambió; actualizá el reporte');
  static readonly TooLarge = new ReportExportState('TOO_LARGE', 'El reporte supera el límite de exportación');
  static readonly Denied = new ReportExportState('DENIED', 'La sesión ya no puede exportar');
  static readonly Unavailable = new ReportExportState('UNAVAILABLE', 'La exportación no está disponible');
  static readonly Failed = new ReportExportState('FAILED', 'No se pudo descargar');
  static readonly Unknown = new ReportExportState('UNKNOWN', 'Estado desconocido');
  static readonly all = Object.freeze([this.Idle, this.Downloading, this.Completed, this.Stale, this.TooLarge, this.Denied, this.Unavailable, this.Failed]);
  static fromWire(raw: unknown): ReportExportState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ReportExportFailureKind extends ClosedWireValue {
  private constructor(wire: string, label: string) { super(wire, label); }
  static readonly StalePeriod = new ReportExportFailureKind('REPORT_PERIOD_STALE', 'El período cambió');
  static readonly TooLarge = new ReportExportFailureKind('REPORT_EXPORT_TOO_LARGE', 'El reporte supera el límite');
  static readonly Denied = new ReportExportFailureKind('DENIED', 'Sin autorización');
  static readonly Unavailable = new ReportExportFailureKind('UNAVAILABLE', 'Servicio no disponible');
  static readonly InvalidResponse = new ReportExportFailureKind('INVALID_RESPONSE', 'Respuesta inválida');
  static readonly Unknown = new ReportExportFailureKind('UNKNOWN', 'Error desconocido');
  static readonly all = Object.freeze([this.StalePeriod, this.TooLarge, this.Denied, this.Unavailable, this.InvalidResponse]);
  static fromWire(raw: unknown): ReportExportFailureKind { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
