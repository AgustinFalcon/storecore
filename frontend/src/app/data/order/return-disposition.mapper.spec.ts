import { ReturnDispositionState, DamageReason } from '../../domain/order/return-disposition';
import { mapReturnDisposition } from './return-disposition.mapper';
const input = () => ({ orderId: '1', returnId: '2', state: 'EDITABLE', lines: [{ returnItemId: '3', orderItemId: '4', sku: 'A', name: 'Artículo', quantity: 2, restockQuantity: null, damagedQuantity: null, rejectedQuantity: null }], result: null });
describe('Return disposition wire boundary', () => {
  it('maps received and confirmed partitions with closed reasons', () => {
    expect(mapReturnDisposition(input()).state).toBe(ReturnDispositionState.Editable);
    const model = mapReturnDisposition({ ...input(), state: 'CONFIRMED', lines: [{ ...input().lines[0], restockQuantity: 1, damagedQuantity: 1, rejectedQuantity: 0, damageReason: 'COSMETIC', rejectionReason: null }], result: { confirmedAt: '2026-11-09T00:00:00Z' } });
    expect(model.state).toBe(ReturnDispositionState.Confirmed);
    expect(model.lines[0].classification?.damageReason).toBe(DamageReason.Cosmetic);
  });
  it('fails closed for malformed lines, unknown reasons, duplicate identities and missing confirmed evidence', () => {
    for (const raw of [{ ...input(), state: 'FUTURE' }, { ...input(), orderId: 'invalid' }, { ...input(), lines: [...input().lines, ...input().lines] }, { ...input(), lines: [{ ...input().lines[0], quantity: -1 }] }, { ...input(), state: 'CONFIRMED' }, { ...input(), lines: [{ ...input().lines[0], restockQuantity: 1, damagedQuantity: 1, rejectedQuantity: 0, damageReason: 'FUTURE' }] }]) expect(mapReturnDisposition(raw).state).toBe(ReturnDispositionState.Unknown);
  });
  it('does not invent a classification for readable historical evidence', () => {
    const model = mapReturnDisposition({ ...input(), state: 'HISTORICAL_INCOMPLETE' });
    expect(model.state).toBe(ReturnDispositionState.HistoricalIncomplete);
    expect(model.lines[0].classification).toBeNull();
  });
});
