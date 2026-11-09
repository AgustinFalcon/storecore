import { InventoryState } from '../catalog/catalog-states';

export class InventoryAvailability {
  private constructor(readonly wire: string, readonly label: string, readonly tone: string, readonly canSell = false) {}
  static readonly Normal = new InventoryAvailability('AVAILABLE', 'Disponible', 'success', true);
  static readonly Out = new InventoryAvailability('OUT_OF_STOCK', 'Sin stock vendible', 'danger');
  static readonly Unavailable = new InventoryAvailability('UNAVAILABLE', 'Sin saldo registrado', 'neutral');
  static readonly Unknown = new InventoryAvailability('UNKNOWN', 'Disponibilidad no informada', 'neutral');
  static fromWire(raw: unknown): InventoryAvailability {
    return [this.Normal, this.Out, this.Unavailable, this.Unknown].find(value => value.wire === raw) ?? this.Unknown;
  }
  static fromQuantities(available: number | null, reserved: number | null, safety: number | null, state = InventoryState.Known): InventoryAvailability {
    if (state === InventoryState.Missing) return this.Unavailable;
    if (state !== InventoryState.Known || ![available, reserved, safety].every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) return this.Unknown;
    return Math.max(available! - safety!, 0) > 0 ? this.Normal : this.Out;
  }
}
