/** Availability is derived only from the authoritative quantities, never by subtraction. */
export class InventoryAvailability {
  private constructor(readonly wire: string, readonly label: string, readonly tone: string) {}

  static readonly Normal = new InventoryAvailability('NORMAL', 'Disponible', 'success');
  static readonly Low = new InventoryAvailability('LOW', 'En o por debajo del stock de seguridad', 'warning');
  static readonly Out = new InventoryAvailability('OUT', 'Sin stock disponible', 'danger');
  static readonly Unknown = new InventoryAvailability('UNKNOWN', 'No informado', 'neutral');

  static fromWire(raw: unknown): InventoryAvailability {
    return VALUES.find((value) => value.wire === raw) ?? InventoryAvailability.Unknown;
  }

  static fromQuantities(available: number | null, reserved: number | null, safety: number | null): InventoryAvailability {
    if (![available, reserved, safety].every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) {
      return InventoryAvailability.Unknown;
    }
    if (available === 0) return InventoryAvailability.Out;
    return available! <= safety! ? InventoryAvailability.Low : InventoryAvailability.Normal;
  }
}

const VALUES = [InventoryAvailability.Normal, InventoryAvailability.Low, InventoryAvailability.Out, InventoryAvailability.Unknown];
