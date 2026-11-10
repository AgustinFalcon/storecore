import { InventoryAdjustmentLookup, InventoryAdjustmentOutcome } from '../../domain/user/inventory-adjustment';
import { mapInventoryAdjustmentLookup, mapInventoryAdjustmentReceipt } from './inventory-adjustment.mapper';
const receipt = () => ({ commandId: '12345678-1234-4234-8234-123456789012', variantId: '42', state: 'APPLIED', reason: null, before: { available: 8, reserved: 3, safety: 2 }, after: { available: 6, reserved: 3, safety: 2 }, ledgerId: '9', recordedAt: '2026-11-10T00:00:00Z' });
describe('inventory adjustment mapper', () => {
  it('accepts only complete authoritative receipts', () => {
    expect(mapInventoryAdjustmentReceipt(receipt()).outcome).toBe(InventoryAdjustmentOutcome.Applied);
    for (const value of [null, { ...receipt(), state: 'FUTURE' }, { ...receipt(), reason: 'FUTURE' }, { ...receipt(), ledgerId: null }, { ...receipt(), ledgerId: 'not-an-id' }, { ...receipt(), variantId: 'future' }, { ...receipt(), recordedAt: 'invalid' }, { ...receipt(), after: { available: 6, reserved: 4, safety: 2 } }, { ...receipt(), state: 'REJECTED', reason: 'FUTURE' }]) expect(mapInventoryAdjustmentReceipt(value).outcome).toBe(InventoryAdjustmentOutcome.Unknown);
  });
  it('accepts only internally consistent durable rejections', () => {
    const rejected = { ...receipt(), state: 'REJECTED', reason: 'BALANCE_CHANGED', after: null, ledgerId: null };
    expect(mapInventoryAdjustmentReceipt(rejected).outcome).toBe(InventoryAdjustmentOutcome.Rejected);
    expect(mapInventoryAdjustmentReceipt({ ...rejected, before: null }).outcome).toBe(InventoryAdjustmentOutcome.Unknown);
    expect(mapInventoryAdjustmentReceipt({ ...rejected, after: receipt().after }).outcome).toBe(InventoryAdjustmentOutcome.Unknown);
    expect(mapInventoryAdjustmentReceipt({ ...rejected, ledgerId: '9' }).outcome).toBe(InventoryAdjustmentOutcome.Unknown);
    const missing = { ...rejected, reason: 'BALANCE_MISSING', before: null };
    expect(mapInventoryAdjustmentReceipt(missing).outcome).toBe(InventoryAdjustmentOutcome.Rejected);
    expect(mapInventoryAdjustmentReceipt({ ...missing, before: receipt().before }).outcome).toBe(InventoryAdjustmentOutcome.Unknown);
  });
  it('separates NOT_FOUND from durable outcomes', () => {
    expect(mapInventoryAdjustmentLookup({ lookup: 'NOT_FOUND', receipt: null }).lookup).toBe(InventoryAdjustmentLookup.NotFound);
    expect(mapInventoryAdjustmentLookup({ lookup: 'FOUND', receipt: receipt() }).receipt?.outcome).toBe(InventoryAdjustmentOutcome.Applied);
    expect(mapInventoryAdjustmentLookup({ lookup: 'FUTURE' }).lookup).toBe(InventoryAdjustmentLookup.Unknown);
  });
});
