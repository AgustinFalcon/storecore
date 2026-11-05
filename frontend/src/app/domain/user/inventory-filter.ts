import { InventoryAvailability } from './inventory-availability';
import type { InventoryRow } from './user.entity';

export class InventoryFilter {
  private constructor(readonly wire: string, readonly label: string, private readonly availability: InventoryAvailability | null) {}

  static readonly All = new InventoryFilter('ALL', 'Todos los estados', null);
  static readonly Normal = new InventoryFilter('NORMAL', InventoryAvailability.Normal.label, InventoryAvailability.Normal);
  static readonly Low = new InventoryFilter('LOW', InventoryAvailability.Low.label, InventoryAvailability.Low);
  static readonly Out = new InventoryFilter('OUT', InventoryAvailability.Out.label, InventoryAvailability.Out);
  static readonly Unknown = new InventoryFilter('UNKNOWN', InventoryAvailability.Unknown.label, InventoryAvailability.Unknown);
  static readonly values: readonly InventoryFilter[] = Object.freeze([
    InventoryFilter.All, InventoryFilter.Normal, InventoryFilter.Low, InventoryFilter.Out, InventoryFilter.Unknown,
  ]);

  static fromWire(raw: unknown): InventoryFilter {
    return InventoryFilter.values.find((filter) => filter.wire === raw) ?? InventoryFilter.Unknown;
  }

  matches(row: InventoryRow): boolean {
    return this.availability === null || this.availability === row.availability;
  }
}
