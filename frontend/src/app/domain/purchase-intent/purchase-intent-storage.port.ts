import { PurchaseIntent } from './purchase-intent';

export class PurchaseIntentStorageResult {
  private constructor(readonly wire: string, readonly label: string, readonly succeeded: boolean) {}
  static readonly Saved = new PurchaseIntentStorageResult('SAVED', 'Selección guardada en esta pestaña', true);
  static readonly Empty = new PurchaseIntentStorageResult('EMPTY', 'Sin selección guardada', true);
  static readonly Cleared = new PurchaseIntentStorageResult('CLEARED', 'Selección eliminada', true);
  static readonly Unavailable = new PurchaseIntentStorageResult('UNAVAILABLE', 'No se pudo guardar o limpiar la selección. No puede garantizarse la limpieza al recargar', false);
  static readonly Unknown = new PurchaseIntentStorageResult('UNKNOWN', 'Selección guardada no reconocida', false);
  static fromWire(raw: unknown): PurchaseIntentStorageResult { return [this.Saved, this.Empty, this.Cleared, this.Unavailable].find(value => value.wire === raw) ?? this.Unknown; }
}
export interface PurchaseIntentLoad { readonly intent: PurchaseIntent; readonly result: PurchaseIntentStorageResult; }
export interface PurchaseIntentStoragePort {
  save(intent: PurchaseIntent): PurchaseIntentStorageResult;
  load(now: number): PurchaseIntentLoad;
  clear(flowId: string): PurchaseIntentStorageResult;
}
export interface ClockPort { now(): number; }
export interface OpaqueIdPort { next(): string; }
