export class ReturnDispositionState {
  private readonly nominal!: 'ReturnDispositionState';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Editable = new ReturnDispositionState('EDITABLE', 'Pendiente de inspección');
  static readonly Confirmed = new ReturnDispositionState('CONFIRMED', 'Inspección confirmada');
  static readonly HistoricalIncomplete = new ReturnDispositionState('HISTORICAL_INCOMPLETE', 'Histórico sin detalle de inspección');
  static readonly Unavailable = new ReturnDispositionState('UNAVAILABLE', 'Inspección no disponible');
  static readonly Unknown = new ReturnDispositionState('UNKNOWN', 'Estado no reconocido');
  static fromWire(raw: unknown): ReturnDispositionState {
    return [this.Editable, this.Confirmed, this.HistoricalIncomplete, this.Unavailable].find(value => value.wire === raw) ?? this.Unknown;
  }
  get canEdit(): boolean { return this === ReturnDispositionState.Editable; }
}

export class DamageReason {
  private readonly nominal!: 'DamageReason';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Cosmetic = new DamageReason('COSMETIC', 'Daño estético');
  static readonly Functional = new DamageReason('FUNCTIONAL', 'Falla de funcionamiento');
  static readonly MissingParts = new DamageReason('MISSING_PARTS', 'Faltan piezas');
  static readonly Unsafe = new DamageReason('UNSAFE', 'No es seguro para su uso');
  static readonly Other = new DamageReason('OTHER', 'Otro daño');
  static readonly Unknown = new DamageReason('UNKNOWN', 'Seleccioná un motivo');
  static readonly choices = [this.Cosmetic, this.Functional, this.MissingParts, this.Unsafe, this.Other];
  static fromWire(raw: unknown): DamageReason { return this.choices.find(value => value.wire === raw) ?? this.Unknown; }
}

export class RejectionReason {
  private readonly nominal!: 'RejectionReason';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly NotOurItem = new RejectionReason('NOT_OUR_ITEM', 'Producto ajeno a la compra');
  static readonly SerialMismatch = new RejectionReason('SERIAL_MISMATCH', 'Número de serie diferente');
  static readonly OutOfPolicy = new RejectionReason('OUT_OF_POLICY', 'Fuera de las condiciones acordadas');
  static readonly IncompleteReturn = new RejectionReason('INCOMPLETE_RETURN', 'Devolución incompleta');
  static readonly Other = new RejectionReason('OTHER', 'Otro motivo');
  static readonly Unknown = new RejectionReason('UNKNOWN', 'Seleccioná un motivo');
  static readonly choices = [this.NotOurItem, this.SerialMismatch, this.OutOfPolicy, this.IncompleteReturn, this.Other];
  static fromWire(raw: unknown): RejectionReason { return this.choices.find(value => value.wire === raw) ?? this.Unknown; }
}

export class DispositionPhase {
  private readonly nominal!: 'DispositionPhase';
  private constructor(readonly label: string) {}
  static readonly Loading = new DispositionPhase('Consultando devolución');
  static readonly Editing = new DispositionPhase('Clasificar unidades');
  static readonly Reviewing = new DispositionPhase('Revisar antes de confirmar');
  static readonly Confirming = new DispositionPhase('Confirmando inspección');
  static readonly Confirmed = new DispositionPhase('Inspección confirmada');
  static readonly ReadOnly = new DispositionPhase('Consulta de devolución');
  static readonly Recovering = new DispositionPhase('Consultando resultado');
  static readonly Uncertain = new DispositionPhase('Resultado pendiente de comprobar');
  static readonly Conflict = new DispositionPhase('La devolución cambió');
  static readonly AccessDenied = new DispositionPhase('Acceso no disponible');
  static readonly Failed = new DispositionPhase('No pudimos consultar la devolución');
  static readonly Unknown = new DispositionPhase('Estado no reconocido');
  get canEdit(): boolean { return this === DispositionPhase.Editing; }
  get busy(): boolean { return [DispositionPhase.Loading, DispositionPhase.Recovering, DispositionPhase.Confirming].includes(this); }
  get canRecover(): boolean { return [DispositionPhase.Uncertain, DispositionPhase.Failed, DispositionPhase.Conflict].includes(this); }
}

export interface DispositionDraftLine {
  readonly returnItemId: string;
  readonly restockQuantity: number;
  readonly damagedQuantity: number;
  readonly rejectedQuantity: number;
  readonly damageReason: DamageReason | null;
  readonly rejectionReason: RejectionReason | null;
  readonly observation: string;
}
export interface ReturnDispositionLine {
  readonly returnItemId: string;
  readonly orderItemId: string;
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly classification: DispositionDraftLine | null;
}
export interface ReturnDisposition {
  readonly orderId: string;
  readonly returnId: string | null;
  readonly state: ReturnDispositionState;
  readonly lines: readonly ReturnDispositionLine[];
  readonly confirmedAt: string | null;
}
export interface ConfirmDispositionCommand {
  readonly idempotencyKey: string;
  readonly lines: readonly DispositionDraftLine[];
}

/** The edit step owns local defaults; no stock is assumed fit for resale. */
export class EditDispositionStep {
  execute(model: ReturnDisposition): readonly DispositionDraftLine[] {
    return model.lines.map(line => ({ returnItemId: line.returnItemId, restockQuantity: 0, damagedQuantity: 0, rejectedQuantity: 0, damageReason: null, rejectionReason: null, observation: '' }));
  }
}
/** The review step validates the whole partition before any command exists. */
export class ReviewDispositionStep {
  validate(model: ReturnDisposition, draft: readonly DispositionDraftLine[]): string | null {
    if (!model.state.canEdit || !model.returnId || !model.lines.length || draft.length !== model.lines.length || new Set(draft.map(line => line.returnItemId)).size !== draft.length) return 'La devolución no permite clasificar estas líneas.';
    for (const line of model.lines) {
      const value = draft.find(item => item.returnItemId === line.returnItemId);
      if (!value || ![value.restockQuantity, value.damagedQuantity, value.rejectedQuantity].every(quantity => Number.isSafeInteger(quantity) && quantity >= 0) || value.restockQuantity + value.damagedQuantity + value.rejectedQuantity !== line.quantity) return `Distribuí exactamente ${line.quantity} unidades de ${line.sku}.`;
      if (value.damagedQuantity > 0 && (!value.damageReason || value.damageReason === DamageReason.Unknown) || value.damagedQuantity === 0 && value.damageReason !== null) return `Revisá el motivo de daño de ${line.sku}.`;
      if (value.rejectedQuantity > 0 && (!value.rejectionReason || value.rejectionReason === RejectionReason.Unknown) || value.rejectedQuantity === 0 && value.rejectionReason !== null) return `Revisá el motivo de rechazo de ${line.sku}.`;
      if ([...value.observation].length > 500) return 'Las observaciones admiten hasta 500 caracteres.';
    }
    return null;
  }
}
/** A confirmed review is the only source for a mutation payload. */
export class ConfirmDispositionStep {
  constructor(private readonly review = new ReviewDispositionStep()) {}
  execute(model: ReturnDisposition, lines: readonly DispositionDraftLine[], key: string): ConfirmDispositionCommand | null {
    return this.review.validate(model, lines) === null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) ? { idempotencyKey: key, lines: lines.map(line => ({ ...line })) } : null;
  }
}
