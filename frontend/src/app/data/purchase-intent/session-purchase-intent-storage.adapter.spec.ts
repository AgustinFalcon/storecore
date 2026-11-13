import { PurchaseIntent } from '../../domain/purchase-intent/purchase-intent';
import { PurchaseIntentStorageResult } from '../../domain/purchase-intent/purchase-intent-storage.port';
import { SessionPurchaseIntentStorageAdapter } from './session-purchase-intent-storage.adapter';

describe('SessionPurchaseIntentStorageAdapter', () => {
  const now = 1000000;
  const intent = PurchaseIntent.capture('opaque-flow-id-001', 'PRODUCT-1', 'VARIANT-2', 2, now);
  let values: Map<string, string>;
  let adapter: SessionPurchaseIntentStorageAdapter;
  beforeEach(() => {
    values = new Map();
    adapter = new SessionPurchaseIntentStorageAdapter(() => ({ getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }));
  });
  it('saves, replaces and clears selection', () => {
    expect(adapter.load(now).result).toBe(PurchaseIntentStorageResult.Empty);
    expect(adapter.save(intent)).toBe(PurchaseIntentStorageResult.Saved);
    expect(adapter.load(now).intent).toEqual(intent);
    const replacement = PurchaseIntent.capture('opaque-flow-id-002', 'P2', 'V3', 3, now);
    adapter.save(replacement);
    expect(adapter.load(now).intent).toEqual(replacement);
    expect(adapter.clear(replacement.flowId)).toBe(PurchaseIntentStorageResult.Cleared);
    expect(adapter.load(now).intent).toBe(PurchaseIntent.Unknown);
  });
  it('removes corrupt or expired data without returning raw input', () => {
    for (const raw of ['{', JSON.stringify({ ...intent.toWire(), version: 99 }), JSON.stringify(intent.toWire())]) {
      values.set(SessionPurchaseIntentStorageAdapter.key, raw);
      expect(adapter.load(intent.expiresAt).intent).toBe(PurchaseIntent.Unknown);
      expect(values.has(SessionPurchaseIntentStorageAdapter.key)).toBe(false);
    }
  });
  it('fails closed for unavailable storage and quota exceptions', () => {
    for (const unavailable of [new SessionPurchaseIntentStorageAdapter(() => undefined), new SessionPurchaseIntentStorageAdapter(() => { throw Error('denied'); })]) {
      expect(unavailable.save(intent)).toBe(PurchaseIntentStorageResult.Unavailable);
      expect(unavailable.load(now).result).toBe(PurchaseIntentStorageResult.Unavailable);
      expect(unavailable.clear(intent.flowId)).toBe(PurchaseIntentStorageResult.Unavailable);
    }
  });
  it('leaves a terminal tombstone when deletion fails', () => {
    const tombstone = new SessionPurchaseIntentStorageAdapter(() => ({ getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); }, removeItem: () => { throw Error('remove unavailable'); } }));
    tombstone.save(intent);
    expect(tombstone.clear(intent.flowId)).toBe(PurchaseIntentStorageResult.Cleared);
    expect(tombstone.load(now).intent).toBe(PurchaseIntent.Unknown);
  });
  it('removes the draft as fallback if writing a tombstone fails', () => {
    adapter.save(intent);
    const fallback = new SessionPurchaseIntentStorageAdapter(() => ({ getItem: key => values.get(key) ?? null,
      setItem: () => { throw Error('quota'); }, removeItem: key => { values.delete(key); } }));
    expect(fallback.clear(intent.flowId)).toBe(PurchaseIntentStorageResult.Cleared);
    expect(values.size).toBe(0);
  });
});
