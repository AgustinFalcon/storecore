import { PurchaseIntent } from '../../domain/purchase-intent/purchase-intent';
import { PurchaseIntentLoad, PurchaseIntentStoragePort, PurchaseIntentStorageResult } from '../../domain/purchase-intent/purchase-intent-storage.port';

interface TabStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
export class SessionPurchaseIntentStorageAdapter implements PurchaseIntentStoragePort {
  static readonly key = 'storecore.purchase-intent.v1';
  constructor(private readonly storage: () => TabStorage | undefined = () => globalThis.sessionStorage) {}
  save(intent: PurchaseIntent): PurchaseIntentStorageResult {
    if (!intent.isKnown) return PurchaseIntentStorageResult.Unknown;
    try { const storage = this.storage(); if (!storage) return PurchaseIntentStorageResult.Unavailable;
      storage.setItem(SessionPurchaseIntentStorageAdapter.key, JSON.stringify(intent.toWire())); return PurchaseIntentStorageResult.Saved;
    } catch { return PurchaseIntentStorageResult.Unavailable; }
  }
  load(now: number): PurchaseIntentLoad {
    try {
      const storage = this.storage(); if (!storage) return { intent: PurchaseIntent.Unknown, result: PurchaseIntentStorageResult.Unavailable };
      const raw = storage.getItem(SessionPurchaseIntentStorageAdapter.key);
      if (raw === null) return { intent: PurchaseIntent.Unknown, result: PurchaseIntentStorageResult.Empty };
      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch { storage.removeItem(SessionPurchaseIntentStorageAdapter.key); return { intent: PurchaseIntent.Unknown, result: PurchaseIntentStorageResult.Unknown }; }
      const intent = PurchaseIntent.fromWire(parsed, now);
      if (!intent.isKnown) { storage.removeItem(SessionPurchaseIntentStorageAdapter.key); return { intent, result: PurchaseIntentStorageResult.Unknown }; }
      return { intent, result: PurchaseIntentStorageResult.Saved };
    } catch { return { intent: PurchaseIntent.Unknown, result: PurchaseIntentStorageResult.Unavailable }; }
  }
  clear(flowId: string): PurchaseIntentStorageResult {
    try {
      const storage = this.storage(); if (!storage) return PurchaseIntentStorageResult.Unavailable;
      // Write first: if removal fails, a fresh instance still cannot restore the consumed draft.
      storage.setItem(SessionPurchaseIntentStorageAdapter.key, JSON.stringify({ version: 1, completed: flowId }));
      try { storage.removeItem(SessionPurchaseIntentStorageAdapter.key); } catch { /* Tombstone already persisted. */ }
      return PurchaseIntentStorageResult.Cleared;
    } catch {
      try { const storage = this.storage(); if (!storage) return PurchaseIntentStorageResult.Unavailable; storage.removeItem(SessionPurchaseIntentStorageAdapter.key); return PurchaseIntentStorageResult.Cleared; }
      catch { return PurchaseIntentStorageResult.Unavailable; }
    }
  }
}
