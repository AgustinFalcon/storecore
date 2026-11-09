import { DamageReason, DispositionDraftLine, RejectionReason, ReturnDisposition, ReturnDispositionLine, ReturnDispositionState } from '../../domain/order/return-disposition';

function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function id(value: unknown): string | null { return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null; }
function quantity(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

/** Only this adapter translates persisted wire states and classifications. */
export function mapReturnDisposition(raw: unknown): ReturnDisposition {
  const value = object(raw);
  let state = ReturnDispositionState.fromWire(value['state']);
  const returnId = id(value['returnId']);
  const orderId = id(value['orderId']);
  let valid = orderId !== null && (state === ReturnDispositionState.Unavailable || returnId !== null) && Array.isArray(value['lines']);
  const lines: ReturnDispositionLine[] = [];
  for (const input of Array.isArray(value['lines']) ? value['lines'] : []) {
    const row = object(input);
    const returnItemId = id(row['returnItemId']);
    const orderItemId = id(row['orderItemId']);
    const received = row['quantity'];
    if (!returnItemId || !orderItemId || !quantity(received) || received === 0 || typeof row['sku'] !== 'string' || !row['sku'].trim() || typeof row['name'] !== 'string' || !row['name'].trim()) { valid = false; continue; }
    let classification: DispositionDraftLine | null = null;
    const restock = row['restockQuantity'], damaged = row['damagedQuantity'], rejected = row['rejectedQuantity'];
    if ([restock, damaged, rejected].some(q => q !== null && q !== undefined)) {
      const damageReason = row['damageReason'] == null ? null : DamageReason.fromWire(row['damageReason']);
      const rejectionReason = row['rejectionReason'] == null ? null : RejectionReason.fromWire(row['rejectionReason']);
      const observation = row['observation'] == null ? '' : row['observation'];
      if (!quantity(restock) || !quantity(damaged) || !quantity(rejected) || restock + damaged + rejected !== received || damageReason === DamageReason.Unknown || rejectionReason === RejectionReason.Unknown || damaged > 0 && !damageReason || damaged === 0 && damageReason !== null || rejected > 0 && !rejectionReason || rejected === 0 && rejectionReason !== null || typeof observation !== 'string' || [...observation].length > 500) valid = false;
      else classification = { returnItemId, restockQuantity: restock, damagedQuantity: damaged, rejectedQuantity: rejected, damageReason, rejectionReason, observation };
    }
    lines.push({ returnItemId, orderItemId, sku: row['sku'], name: row['name'], quantity: received, classification });
  }
  if (new Set(lines.map(line => line.returnItemId)).size !== lines.length || new Set(lines.map(line => line.orderItemId)).size !== lines.length || state === ReturnDispositionState.Editable && (!lines.length || lines.some(line => line.classification !== null)) || state === ReturnDispositionState.Confirmed && (!lines.length || lines.some(line => !line.classification))) valid = false;
  const result = object(value['result']);
  const confirmedAt = typeof result['confirmedAt'] === 'string' && Number.isFinite(Date.parse(result['confirmedAt'])) ? result['confirmedAt'] : null;
  if (state === ReturnDispositionState.Confirmed && confirmedAt === null) valid = false;
  if (!valid) state = ReturnDispositionState.Unknown;
  return { orderId: orderId ?? '', returnId, state, lines, confirmedAt };
}
