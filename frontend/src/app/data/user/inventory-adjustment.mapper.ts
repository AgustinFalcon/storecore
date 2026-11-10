import { InventoryAdjustmentLookup, InventoryAdjustmentOutcome, InventoryAdjustmentReceipt, InventoryAdjustmentRejection, InventoryAdjustmentResult, InventoryBalance, isCommandId, isInventoryQuantity } from '../../domain/user/inventory-adjustment';
const record = (raw: unknown): Record<string, unknown> => raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
export function mapAdjustmentBalance(raw: unknown): InventoryBalance | null {
  const value = record(raw);
  return isInventoryQuantity(value['available']) && isInventoryQuantity(value['reserved']) && isInventoryQuantity(value['safety']) ? { available: value['available'], reserved: value['reserved'], safety: value['safety'] } : null;
}
export function mapInventoryAdjustmentReceipt(raw: unknown): InventoryAdjustmentReceipt {
  const value = record(raw);
  let outcome = InventoryAdjustmentOutcome.fromWire(value['state']);
  const rejection = InventoryAdjustmentRejection.fromWire(value['reason']);
  const before = mapAdjustmentBalance(value['before']); const after = mapAdjustmentBalance(value['after']);
  const commandId = typeof value['commandId'] === 'string' ? value['commandId'] : '';
  const variantId = typeof value['variantId'] === 'string' ? value['variantId'] : '';
  const recordedAt = typeof value['recordedAt'] === 'string' ? value['recordedAt'] : '';
  const ledgerId = typeof value['ledgerId'] === 'string' && value['ledgerId'].trim() ? value['ledgerId'] : null;
  const positiveId = (candidate: string | null): boolean => candidate !== null && /^[1-9]\d*$/.test(candidate);
  if (!isCommandId(commandId) || !positiveId(variantId) || !recordedAt || !Number.isFinite(Date.parse(recordedAt))) outcome = InventoryAdjustmentOutcome.Unknown;
  if (outcome === InventoryAdjustmentOutcome.Applied && (
    value['reason'] !== null || !before || !after || !positiveId(ledgerId)
    || before.reserved !== after.reserved || before.safety !== after.safety
  )) outcome = InventoryAdjustmentOutcome.Unknown;
  if (outcome === InventoryAdjustmentOutcome.Rejected && (
    rejection === InventoryAdjustmentRejection.Unknown || value['after'] !== null || value['ledgerId'] !== null
    || (rejection === InventoryAdjustmentRejection.BalanceMissing ? value['before'] !== null : !before)
  )) outcome = InventoryAdjustmentOutcome.Unknown;
  return { commandId, variantId, outcome, rejection, before, after, ledgerId, recordedAt };
}
export function mapInventoryAdjustmentLookup(raw: unknown): InventoryAdjustmentResult {
  const value = record(raw); const lookup = InventoryAdjustmentLookup.fromWire(value['lookup']);
  return { lookup, receipt: lookup === InventoryAdjustmentLookup.Found ? mapInventoryAdjustmentReceipt(value['receipt']) : null };
}
