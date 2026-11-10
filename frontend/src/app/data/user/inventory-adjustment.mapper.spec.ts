import { InventoryAdjustmentLookup, InventoryAdjustmentOutcome } from '../../domain/user/inventory-adjustment';
import { mapInventoryAdjustmentLookup, mapInventoryAdjustmentReceipt } from './inventory-adjustment.mapper';
const receipt = () => ({ commandId: '12345678-1234-4234-8234-123456789012', variantId: '42', state: 'APPLIED', before: { available: 8, reserved: 3, safety: 2 }, after: { available: 6, reserved: 3, safety: 2 }, ledgerId: '9', recordedAt: '2026-11-10T00:00:00Z' });
describe('inventory adjustment mapper', () => {
  it('accepts only complete authoritative receipts', () => {
    expect(mapInventoryAdjustmentReceipt(receipt()).outcome).toBe(InventoryAdjustmentOutcome.Applied);
    for (const value of [null, { ...receipt(), state: 'FUTURE' }, { ...receipt(), ledgerId: null }, { ...receipt(), recordedAt: 'invalid' }, { ...receipt(), after: { available: 6, reserved: 4, safety: 2 } }, { ...receipt(), state: 'REJECTED', reason: 'FUTURE' }]) expect(mapInventoryAdjustmentReceipt(value).outcome).toBe(InventoryAdjustmentOutcome.Unknown);
  });
  it('separates NOT_FOUND from durable outcomes', () => {
    expect(mapInventoryAdjustmentLookup({ lookup: 'NOT_FOUND', receipt: null }).lookup).toBe(InventoryAdjustmentLookup.NotFound);
    expect(mapInventoryAdjustmentLookup({ lookup: 'FOUND', receipt: receipt() }).receipt?.outcome).toBe(InventoryAdjustmentOutcome.Applied);
    expect(mapInventoryAdjustmentLookup({ lookup: 'FUTURE' }).lookup).toBe(InventoryAdjustmentLookup.Unknown);
  });
});
