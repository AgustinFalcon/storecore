import { InventoryState } from '../catalog/catalog-states';
import { InventoryRow } from './user.entity';

export class InventoryAdjustmentPhase {
  private readonly nominal!: 'InventoryAdjustmentPhase';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Closed = new InventoryAdjustmentPhase('CLOSED', 'Ajustar disponible');
  static readonly Editing = new InventoryAdjustmentPhase('EDITING', 'Ajustar disponible');
  static readonly Reviewing = new InventoryAdjustmentPhase('REVIEWING', 'Revisar ajuste');
  static readonly Submitting = new InventoryAdjustmentPhase('SUBMITTING', 'Registrando ajuste…');
  static readonly Applied = new InventoryAdjustmentPhase('APPLIED', 'Ajuste registrado');
  static readonly Rejected = new InventoryAdjustmentPhase('REJECTED', 'Ajuste rechazado');
  static readonly Conflict = new InventoryAdjustmentPhase('CONFLICT', 'El saldo cambió');
  static readonly OutcomeUnknown = new InventoryAdjustmentPhase('OUTCOME_UNKNOWN', 'Resultado pendiente de comprobar');
  static readonly Recovering = new InventoryAdjustmentPhase('RECOVERING', 'Consultando resultado…');
  static readonly AccessDenied = new InventoryAdjustmentPhase('ACCESS_DENIED', 'Acceso no disponible');
  static readonly Unknown = new InventoryAdjustmentPhase('UNKNOWN', 'Estado no reconocido');
  static fromWire(raw: unknown): InventoryAdjustmentPhase { return [this.Closed, this.Editing, this.Reviewing, this.Submitting, this.Applied, this.Rejected, this.Conflict, this.OutcomeUnknown, this.Recovering, this.AccessDenied].find(value => value.wire === raw) ?? this.Unknown; }
  get canEdit(): boolean { return this === InventoryAdjustmentPhase.Editing; }
  get busy(): boolean { return this === InventoryAdjustmentPhase.Submitting || this === InventoryAdjustmentPhase.Recovering; }
  get uncertain(): boolean { return this === InventoryAdjustmentPhase.OutcomeUnknown || this === InventoryAdjustmentPhase.Unknown; }
  get canRecover(): boolean { return this.uncertain; }
  get reviewing(): boolean { return this === InventoryAdjustmentPhase.Reviewing; }
  get conflict(): boolean { return this === InventoryAdjustmentPhase.Conflict; }
  get applied(): boolean { return this === InventoryAdjustmentPhase.Applied; }
}

export class InventoryAdjustmentOutcome {
  private readonly nominal!: 'InventoryAdjustmentOutcome';
  private constructor(readonly wire: string) {}
  static readonly Applied = new InventoryAdjustmentOutcome('APPLIED');
  static readonly Rejected = new InventoryAdjustmentOutcome('REJECTED');
  static readonly Unknown = new InventoryAdjustmentOutcome('UNKNOWN');
  static fromWire(raw: unknown): InventoryAdjustmentOutcome { return [this.Applied, this.Rejected].find(value => value.wire === raw) ?? this.Unknown; }
}
export class InventoryAdjustmentRejection {
  private readonly nominal!: 'InventoryAdjustmentRejection';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly BalanceChanged = new InventoryAdjustmentRejection('BALANCE_CHANGED', 'El saldo cambió. Revisá la propuesta con el saldo actual.');
  static readonly BalanceMissing = new InventoryAdjustmentRejection('BALANCE_MISSING', 'La variante ya no tiene saldo registrado.');
  static readonly Negative = new InventoryAdjustmentRejection('WOULD_MAKE_AVAILABLE_NEGATIVE', 'El disponible resultante no puede ser negativo.');
  static readonly Overflow = new InventoryAdjustmentRejection('QUANTITY_OVERFLOW', 'La cantidad supera el límite permitido.');
  static readonly Unknown = new InventoryAdjustmentRejection('UNKNOWN', 'No pudimos comprobar el resultado.');
  static fromWire(raw: unknown): InventoryAdjustmentRejection { return [this.BalanceChanged, this.BalanceMissing, this.Negative, this.Overflow].find(value => value.wire === raw) ?? this.Unknown; }
}
export class InventoryAdjustmentRequestError {
  private readonly nominal!: 'InventoryAdjustmentRequestError';
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Invalid = new InventoryAdjustmentRequestError('INVALID_COMMAND', 'El comando no es válido. Comprobá el resultado antes de continuar.');
  static readonly Conflict = new InventoryAdjustmentRequestError('IDEMPOTENCY_CONFLICT', 'El identificador ya corresponde a otro comando. Comprobá el resultado.');
  static readonly Unknown = new InventoryAdjustmentRequestError('UNKNOWN', 'No pudimos confirmar el resultado. El ajuste puede haberse aplicado.');
  static fromWire(raw: unknown): InventoryAdjustmentRequestError { return [this.Invalid, this.Conflict].find(value => value.wire === raw) ?? this.Unknown; }
}
export class InventoryAdjustmentLookup {
  private readonly nominal!: 'InventoryAdjustmentLookup';
  private constructor(readonly wire: string) {}
  static readonly Found = new InventoryAdjustmentLookup('FOUND');
  static readonly NotFound = new InventoryAdjustmentLookup('NOT_FOUND');
  static readonly Unknown = new InventoryAdjustmentLookup('UNKNOWN');
  static fromWire(raw: unknown): InventoryAdjustmentLookup { return [this.Found, this.NotFound].find(value => value.wire === raw) ?? this.Unknown; }
}
export interface InventoryBalance { readonly available: number; readonly reserved: number; readonly safety: number; }
export class InventoryBalanceProjection {
  static onHand(balance: InventoryBalance): number { return balance.available + balance.reserved; }
  static saleable(balance: InventoryBalance): number { return Math.max(balance.available - balance.safety, 0); }
}
export interface AdjustAvailableStockCommand { readonly commandId: string; readonly variantId: string; readonly quantityDelta: number; readonly expected: InventoryBalance; readonly reason: string; }
export interface InventoryAdjustmentReceipt { readonly commandId: string; readonly variantId: string; readonly outcome: InventoryAdjustmentOutcome; readonly rejection: InventoryAdjustmentRejection; readonly before: InventoryBalance | null; readonly after: InventoryBalance | null; readonly ledgerId: string | null; readonly recordedAt: string; }
export interface InventoryAdjustmentResult { readonly lookup: InventoryAdjustmentLookup; readonly receipt: InventoryAdjustmentReceipt | null; }
export const isInventoryQuantity = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2147483647;
export const isCommandId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export class EditInventoryAdjustmentStep {
  execute(row: InventoryRow): InventoryBalance | null {
    return row.state === InventoryState.Known && row.variantId.trim() && isInventoryQuantity(row.availableQuantity) && isInventoryQuantity(row.reservedQuantity) && isInventoryQuantity(row.safetyStock)
      ? Object.freeze({ available: row.availableQuantity, reserved: row.reservedQuantity, safety: row.safetyStock }) : null;
  }
}
export class ReviewInventoryAdjustmentStep {
  delta(raw: string): number | null {
    if (!/^[+-]?\d+$/.test(raw.trim())) return null;
    const value = Number(raw.trim());
    return Number.isInteger(value) && value !== 0 && value >= -2147483648 && value <= 2147483647 ? value : null;
  }
  error(balance: InventoryBalance, raw: string, reason: string): string | null {
    const delta = this.delta(raw);
    if (delta === null) return 'Ingresá una variación entera distinta de cero, entre −2147483648 y 2147483647.';
    if (!isInventoryQuantity(balance.available + delta)) return 'El disponible resultante debe estar entre 0 y 2147483647.';
    if (!reason.trim() || reason.trim().length > 500) return 'Ingresá un motivo de 1 a 500 caracteres.';
    return null;
  }
  proposed(balance: InventoryBalance, raw: string): InventoryBalance | null { const delta = this.delta(raw); return delta !== null && isInventoryQuantity(balance.available + delta) ? { ...balance, available: balance.available + delta } : null; }
}
export class ConfirmInventoryAdjustmentStep {
  execute(variantId: string, balance: InventoryBalance, raw: string, reason: string, commandId: string): AdjustAvailableStockCommand | null {
    const review = new ReviewInventoryAdjustmentStep();
    return variantId.trim() && isCommandId(commandId) && !review.error(balance, raw, reason) ? Object.freeze({ commandId, variantId, quantityDelta: review.delta(raw)!, expected: Object.freeze({ ...balance }), reason: reason.trim() }) : null;
  }
}
export class RecoverInventoryAdjustmentStep {
  accepts(command: AdjustAvailableStockCommand, receipt: InventoryAdjustmentReceipt): boolean { return receipt.commandId === command.commandId && receipt.variantId === command.variantId && receipt.outcome !== InventoryAdjustmentOutcome.Unknown; }
}
