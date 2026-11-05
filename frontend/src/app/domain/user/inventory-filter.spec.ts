import { InventoryAvailability } from './inventory-availability';
import { InventoryFilter } from './inventory-filter';
import { InventoryRow } from './user.entity';

describe('InventoryFilter', () => {
  it('filters every closed availability and preserves unknown as its own case', () => {
    const states = [InventoryAvailability.Normal, InventoryAvailability.Low, InventoryAvailability.Out, InventoryAvailability.Unknown];
    const rows: InventoryRow[] = states.map((availability) => ({ sku: 'SKU', availableQuantity: null, reservedQuantity: null, safetyStock: null, availability }));
    expect(rows.filter((row) => InventoryFilter.All.matches(row))).toHaveLength(4);
    for (const [index, filter] of InventoryFilter.values.slice(1).entries()) {
      expect(rows.filter((row) => filter.matches(row))).toEqual([rows[index]]);
    }
  });

  it('decodes exact filter options once and fails closed for unexpected input', () => {
    for (const filter of InventoryFilter.values) expect(InventoryFilter.fromWire(filter.wire)).toBe(filter);
    for (const raw of [undefined, null, '', 'all', {}, 0]) expect(InventoryFilter.fromWire(raw)).toBe(InventoryFilter.Unknown);
  });
});
