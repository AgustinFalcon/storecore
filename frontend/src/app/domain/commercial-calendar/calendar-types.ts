export class CalendarLifecycle {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Draft = new CalendarLifecycle('DRAFT', 'Borrador');
  static readonly Scheduled = new CalendarLifecycle('SCHEDULED', 'Programado');
  static readonly Active = new CalendarLifecycle('ACTIVE', 'Activo');
  static readonly Paused = new CalendarLifecycle('PAUSED', 'Pausado');
  static readonly Completed = new CalendarLifecycle('COMPLETED', 'Completado');
  static readonly Cancelled = new CalendarLifecycle('CANCELLED', 'Cancelado');
  static readonly Unknown = new CalendarLifecycle('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Draft, this.Scheduled, this.Active, this.Paused, this.Completed, this.Cancelled]);
  static fromWire(raw: unknown): CalendarLifecycle { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  allows(operation: CalendarOperation): boolean { return CalendarStep.fromOperation(operation).allows(this); }
}

export class CalendarAudience {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly InternalAll = new CalendarAudience('INTERNAL_ALL', 'Equipo interno');
  static readonly Unknown = new CalendarAudience('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.InternalAll]);
  static fromWire(raw: unknown): CalendarAudience { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarOperation {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Create = new CalendarOperation('CREATE', 'Crear');
  static readonly Edit = new CalendarOperation('EDIT', 'Editar');
  static readonly Schedule = new CalendarOperation('SCHEDULE', 'Programar');
  static readonly Pause = new CalendarOperation('PAUSE', 'Pausar');
  static readonly Resume = new CalendarOperation('RESUME', 'Reanudar');
  static readonly Cancel = new CalendarOperation('CANCEL', 'Cancelar');
  static readonly SystemActivate = new CalendarOperation('SYSTEM_ACTIVATE', 'Activación del sistema');
  static readonly SystemComplete = new CalendarOperation('SYSTEM_COMPLETE', 'Finalización del sistema');
  static readonly Unknown = new CalendarOperation('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Create, this.Edit, this.Schedule, this.Pause, this.Resume, this.Cancel, this.SystemActivate, this.SystemComplete]);
  static fromWire(raw: unknown): CalendarOperation { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  get system(): boolean { return this === CalendarOperation.SystemActivate || this === CalendarOperation.SystemComplete; }
}

export class CalendarOutcome {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Applied = new CalendarOutcome('APPLIED', 'Aplicado');
  static readonly RevisionConflict = new CalendarOutcome('REVISION_CONFLICT', 'Revisión en conflicto');
  static readonly InvalidTransition = new CalendarOutcome('INVALID_TRANSITION', 'Transición inválida');
  static readonly InvalidDefinition = new CalendarOutcome('INVALID_DEFINITION', 'Definición inválida');
  static readonly PreflightRequired = new CalendarOutcome('PREFLIGHT_REQUIRED', 'Revisión previa requerida');
  static readonly PreflightExpired = new CalendarOutcome('PREFLIGHT_EXPIRED', 'Revisión vencida');
  static readonly PreflightStale = new CalendarOutcome('PREFLIGHT_STALE', 'Revisión desactualizada');
  static readonly RevisionExhausted = new CalendarOutcome('REVISION_EXHAUSTED', 'Revisiones agotadas');
  static readonly Unknown = new CalendarOutcome('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Applied, this.RevisionConflict, this.InvalidTransition, this.InvalidDefinition, this.PreflightRequired, this.PreflightExpired, this.PreflightStale, this.RevisionExhausted]);
  static fromWire(raw: unknown): CalendarOutcome { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarPreflightIssue {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly InvalidLifecycle = new CalendarPreflightIssue('INVALID_LIFECYCLE', 'Estado inválido');
  static readonly LeadTooShort = new CalendarPreflightIssue('LEAD_TOO_SHORT', 'Anticipación insuficiente');
  static readonly HorizonExceeded = new CalendarPreflightIssue('HORIZON_EXCEEDED', 'Fuera del horizonte');
  static readonly InvalidWindow = new CalendarPreflightIssue('INVALID_WINDOW', 'Vigencia inválida');
  static readonly Unknown = new CalendarPreflightIssue('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.InvalidLifecycle, this.LeadTooShort, this.HorizonExceeded, this.InvalidWindow]);
  static fromWire(raw: unknown): CalendarPreflightIssue { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarReminderChannel {
  private constructor(readonly wire: string, readonly label: string, readonly guidance: string) {}
  static readonly InApp = new CalendarReminderChannel('IN_APP', 'En la aplicación', 'La entrega depende de la disponibilidad del runner y del interruptor operativo. Guardar reglas no implica que estén activas.');
  static readonly Unknown = new CalendarReminderChannel('UNKNOWN', 'Desconocido', 'No se pudo determinar el canal del recordatorio.');
  static readonly all = Object.freeze([this.InApp]);
  static fromWire(raw: unknown): CalendarReminderChannel { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarSwitchState {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Disabled = new CalendarSwitchState('DISABLED', 'Deshabilitado');
  static readonly Enabled = new CalendarSwitchState('ENABLED', 'Habilitado');
  static readonly Unknown = new CalendarSwitchState('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Disabled, this.Enabled]);
  static fromWire(raw: unknown): CalendarSwitchState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarSwitchEffectivity {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Effective = new CalendarSwitchEffectivity('EFFECTIVE', 'Vigente');
  static readonly Disabled = new CalendarSwitchEffectivity('DISABLED', 'Deshabilitado');
  static readonly Expired = new CalendarSwitchEffectivity('EXPIRED', 'Vencido');
  static readonly Unknown = new CalendarSwitchEffectivity('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Effective, this.Disabled, this.Expired]);
  static fromWire(raw: unknown): CalendarSwitchEffectivity { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarSwitchAction {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly EmitInAppCampaignReminder = new CalendarSwitchAction('EMIT_IN_APP_CAMPAIGN_REMINDER', 'Emitir recordatorio de campaña en la aplicación');
  static readonly Unknown = new CalendarSwitchAction('UNKNOWN', 'Desconocida');
  static readonly all = Object.freeze([this.EmitInAppCampaignReminder]);
  static fromWire(raw: unknown): CalendarSwitchAction { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarReminderReadiness {
  private constructor(readonly wire: string, readonly label: string, readonly message: string) {}
  static readonly Unavailable = new CalendarReminderReadiness('UNAVAILABLE', 'No disponible', 'La ejecuci\u00f3n autom\u00e1tica de recordatorios no est\u00e1 disponible en esta instancia. Las reglas guardadas siguen siendo datos de agenda.');
  static readonly Ready = new CalendarReminderReadiness('READY', 'Disponible', 'El ejecutor local de recordatorios est\u00e1 disponible en esta instancia. Esto no confirma que el interruptor est\u00e9 efectivo ni que un recordatorio haya sido entregado.');
  static readonly Unknown = new CalendarReminderReadiness('UNKNOWN', 'Desconocido', 'No se pudo determinar la disponibilidad de los recordatorios autom\u00e1ticos.');
  static readonly all = Object.freeze([this.Unavailable, this.Ready]);
  static fromWire(raw: unknown): CalendarReminderReadiness { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarViewMode {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Month = new CalendarViewMode('month', 'Mes');
  static readonly List = new CalendarViewMode('list', 'Lista');
  static readonly Unknown = new CalendarViewMode('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Month, this.List]);
  static fromWire(raw: unknown): CalendarViewMode { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarLoadState {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Loading = new CalendarLoadState('LOADING', 'Cargando');
  static readonly Refreshing = new CalendarLoadState('REFRESHING', 'Actualizando');
  static readonly Ready = new CalendarLoadState('READY', 'Disponible');
  static readonly Stale = new CalendarLoadState('STALE', 'Desactualizado');
  static readonly Empty = new CalendarLoadState('EMPTY', 'Sin eventos');
  static readonly Denied = new CalendarLoadState('DENIED', 'Sin autorización');
  static readonly Invalid = new CalendarLoadState('INVALID', 'Inválido');
  static readonly Unavailable = new CalendarLoadState('UNAVAILABLE', 'No disponible');
  static readonly Corrupt = new CalendarLoadState('CORRUPT', 'Datos inválidos');
  static readonly Error = new CalendarLoadState('ERROR', 'Error');
  static readonly Unknown = new CalendarLoadState('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Loading, this.Refreshing, this.Ready, this.Stale, this.Empty, this.Denied, this.Invalid, this.Unavailable, this.Corrupt, this.Error]);
  static fromWire(raw: unknown): CalendarLoadState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarRecoveryState {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Clear = new CalendarRecoveryState('CLEAR', 'Sin comando pendiente');
  static readonly Pending = new CalendarRecoveryState('PENDING', 'Pendiente de recuperación');
  static readonly Corrupt = new CalendarRecoveryState('CORRUPT', 'Recuperación bloqueada');
  static readonly Unknown = new CalendarRecoveryState('UNKNOWN', 'Desconocido');
  static readonly all = Object.freeze([this.Clear, this.Pending, this.Corrupt]);
  static fromWire(raw: unknown): CalendarRecoveryState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CalendarStep {
  private constructor(readonly operation: CalendarOperation, private readonly sources: readonly CalendarLifecycle[]) {}
  static readonly Edit = new CalendarStep(CalendarOperation.Edit, [CalendarLifecycle.Draft]);
  static readonly Schedule = new CalendarStep(CalendarOperation.Schedule, [CalendarLifecycle.Draft]);
  static readonly Pause = new CalendarStep(CalendarOperation.Pause, [CalendarLifecycle.Scheduled, CalendarLifecycle.Active]);
  static readonly Resume = new CalendarStep(CalendarOperation.Resume, [CalendarLifecycle.Paused]);
  static readonly Cancel = new CalendarStep(CalendarOperation.Cancel, [CalendarLifecycle.Draft, CalendarLifecycle.Scheduled, CalendarLifecycle.Active, CalendarLifecycle.Paused]);
  static readonly Unknown = new CalendarStep(CalendarOperation.Unknown, []);
  static readonly all = Object.freeze([this.Edit, this.Schedule, this.Pause, this.Resume, this.Cancel]);
  static fromOperation(value: CalendarOperation): CalendarStep { return this.all.find(step => step.operation === value) ?? this.Unknown; }
  allows(lifecycle: CalendarLifecycle): boolean { return this.sources.includes(lifecycle); }
}
