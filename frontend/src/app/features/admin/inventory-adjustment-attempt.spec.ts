import { ConfirmInventoryAdjustmentStep } from '../../domain/user/inventory-adjustment';
import { InventoryAdjustmentAttemptJournal } from './inventory-adjustment-attempt';
const attempt = () => ({ version: 1 as const, actor: 'actor', epoch: 'epoch', sku: 'SKU', command: new ConfirmInventoryAdjustmentStep().execute('42', { available: 8, reserved: 3, safety: 2 }, '-2', 'Conteo', '12345678-1234-4234-8234-123456789012')! });
describe('Inventory adjustment attempt journal', () => {
  beforeEach(() => sessionStorage.clear()); afterEach(() => vi.restoreAllMocks());
  it('restores one validated frozen attempt across instances and refuses overwrite', () => {
    const journal = new InventoryAdjustmentAttemptJournal(); expect(journal.remember(attempt())).toBe(true);
    expect(journal.remember({ ...attempt(), sku: 'OTHER' })).toBe(false);
    expect(new InventoryAdjustmentAttemptJournal().read('actor', 'epoch')).toEqual(attempt());
    expect(journal.read('actor', 'new epoch')).toBeNull();
  });
  it('fails closed on full/unavailable storage and malformed persisted values', () => {
    const journal = new InventoryAdjustmentAttemptJournal();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(journal.remember(attempt())).toBe(false); vi.restoreAllMocks();
    sessionStorage.setItem('sc:inventory-adjustment:v1', JSON.stringify({ ...attempt(), command: { ...attempt().command, quantityDelta: '2' } }));
    expect(() => journal.read('actor', 'epoch')).toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => journal.read('actor', 'epoch')).toThrow();
  });
});
