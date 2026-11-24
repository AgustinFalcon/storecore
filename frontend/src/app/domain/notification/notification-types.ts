export class NotificationSeverity {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Info = new NotificationSeverity('INFO', 'Informativa');
  static readonly Warning = new NotificationSeverity('WARNING', 'Advertencia');
  static readonly Critical = new NotificationSeverity('CRITICAL', 'Crítica');
  static readonly Unknown = new NotificationSeverity('UNKNOWN', 'Desconocida');
  static readonly all = [this.Info, this.Warning, this.Critical];
  static readonly email = [this.Warning, this.Critical];
  static fromWire(raw: unknown): NotificationSeverity { return this.all.find(x => x.wire === raw) ?? this.Unknown; }
}
export class NotificationCategory {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Stock = new NotificationCategory('STOCK', 'Stock');
  static readonly Order = new NotificationCategory('ORDER', 'Pedidos');
  static readonly Payment = new NotificationCategory('PAYMENT', 'Pagos');
  static readonly Return = new NotificationCategory('RETURN', 'Devoluciones');
  static readonly Integration = new NotificationCategory('INTEGRATION', 'Integraciones');
  static readonly Campaign = new NotificationCategory('CAMPAIGN', 'Campañas');
  static readonly Unknown = new NotificationCategory('UNKNOWN', 'Desconocida');
  static readonly email = [this.Stock, this.Order, this.Payment, this.Return, this.Integration];
  static readonly all = [...this.email, this.Campaign];
  static fromWire(raw: unknown): NotificationCategory { return this.all.find(x => x.wire === raw) ?? this.Unknown; }
}
export class NotificationSource {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly StoreCore = new NotificationSource('STORECORE_FACT', 'StoreCore');
  static readonly BlackStore = new NotificationSource('BLACKSTORE_STOCK_RECEIPT', 'Recepción de stock BlackStore');
  static readonly Campaign = new NotificationSource('SYSTEM_CAMPAIGN', 'Campaña del sistema');
  static readonly Unknown = new NotificationSource('UNKNOWN', 'Desconocida');
  static readonly all = [this.StoreCore, this.BlackStore, this.Campaign];
  static fromWire(raw: unknown): NotificationSource { return this.all.find(x => x.wire === raw) ?? this.Unknown; }
}
export class NotificationLifecycle {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Open = new NotificationLifecycle('OPEN', 'Abierta');
  static readonly Acknowledged = new NotificationLifecycle('ACKNOWLEDGED', 'Reconocida');
  static readonly Resolved = new NotificationLifecycle('RESOLVED', 'Resuelta');
  static readonly Unknown = new NotificationLifecycle('UNKNOWN', 'Desconocido');
  static readonly all = [this.Open, this.Acknowledged, this.Resolved];
  static fromWire(raw: unknown): NotificationLifecycle { return this.all.find(x => x.wire === raw) ?? this.Unknown; }
}
/** Each transition owns its precondition; adding a step does not rewrite other steps. */
export class NotificationStep {
  private constructor(readonly wire: string, readonly label: string, private readonly origins: readonly NotificationLifecycle[], readonly destination: NotificationLifecycle) {}
  static readonly Acknowledge = new NotificationStep('ACKNOWLEDGE', 'Reconocer', [NotificationLifecycle.Open], NotificationLifecycle.Acknowledged);
  static readonly Resolve = new NotificationStep('RESOLVE', 'Resolver', [NotificationLifecycle.Open, NotificationLifecycle.Acknowledged], NotificationLifecycle.Resolved);
  static readonly Reopen = new NotificationStep('REOPEN', 'Reabrir', [NotificationLifecycle.Resolved], NotificationLifecycle.Open);
  static readonly Unknown = new NotificationStep('UNKNOWN', 'Acción desconocida', [], NotificationLifecycle.Unknown);
  static readonly all = [this.Acknowledge, this.Resolve, this.Reopen];
  accepts(lifecycle: NotificationLifecycle): boolean { return this.origins.includes(lifecycle); }
  static fromWire(raw: unknown): NotificationStep { return this.all.find(x => x.wire === raw) ?? this.Unknown; }
}
export class EmailReadiness {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Unconfigured = new EmailReadiness('UNCONFIGURED', 'Correo sin configurar. No se envían notificaciones por email.');
  static readonly Unavailable = new EmailReadiness('UNAVAILABLE', 'Entrega de correo no disponible.');
  static readonly Ready = new EmailReadiness('READY', 'Entrega de correo preparada.');
  static readonly Unknown = new EmailReadiness('UNKNOWN', 'Preparación del correo desconocida.');
  static fromWire(raw: unknown): EmailReadiness { return [this.Unconfigured, this.Unavailable, this.Ready].find(x => x.wire === raw) ?? this.Unknown; }
}
export class EmailPreferenceState {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Disabled = new EmailPreferenceState('DISABLED', 'Desactivada');
  static readonly Enabled = new EmailPreferenceState('ENABLED', 'Activada');
  static readonly Invalidated = new EmailPreferenceState('INVALIDATED', 'Requiere nuevo consentimiento');
  static readonly Unknown = new EmailPreferenceState('UNKNOWN', 'Desconocida');
  static fromWire(raw: unknown): EmailPreferenceState { return [this.Disabled, this.Enabled, this.Invalidated].find(x => x.wire === raw) ?? this.Unknown; }
}
export class EmailOperation {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Enable = new EmailOperation('ENABLE', 'Activar preferencia');
  static readonly Disable = new EmailOperation('DISABLE', 'Desactivar preferencia');
  static readonly Unknown = new EmailOperation('UNKNOWN', 'Acción desconocida');
  static fromWire(raw: unknown): EmailOperation { return [this.Enable, this.Disable].find(x => x.wire === raw) ?? this.Unknown; }
}
export class NotificationOutcome {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Applied = new NotificationOutcome('APPLIED', 'Comando aplicado');
  static readonly RevisionConflict = new NotificationOutcome('REVISION_CONFLICT', 'La revisión cambió. Actualizá antes de crear otro comando.');
  static readonly InvalidTransition = new NotificationOutcome('INVALID_TRANSITION', 'La transición ya no está disponible.');
  static readonly RevisionExhausted = new NotificationOutcome('REVISION_EXHAUSTED', 'Se alcanzó el límite de revisiones.');
  static readonly EmailUnverified = new NotificationOutcome('EMAIL_UNVERIFIED', 'Verificá tu correo actual antes de activar la preferencia.');
  static readonly Unknown = new NotificationOutcome('UNKNOWN', 'Resultado desconocido');
  static fromWire(raw: unknown): NotificationOutcome { return [this.Applied, this.RevisionConflict, this.InvalidTransition, this.RevisionExhausted, this.EmailUnverified].find(x => x.wire === raw) ?? this.Unknown; }
}
export class NotificationLoadState {
  private constructor(readonly label: string) {}
  static readonly Loading = new NotificationLoadState('Cargando notificaciones…');
  static readonly Ready = new NotificationLoadState('Actualizado');
  static readonly Empty = new NotificationLoadState('No hay notificaciones para estos filtros.');
  static readonly Error = new NotificationLoadState('No se pudieron cargar los datos.');
  static readonly Stale = new NotificationLoadState('Datos anteriores. La actualización falló.');
  static readonly Denied = new NotificationLoadState('Tu sesión no tiene acceso.');
  static readonly Invalid = new NotificationLoadState('Los filtros o el identificador no son válidos.');
  static readonly Unknown = new NotificationLoadState('Estado desconocido');
}
