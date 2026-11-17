import { PurchaseIntent, validPurchaseFlowId } from '../../domain/purchase-intent/purchase-intent';
import { PurchaseIntentLoad, PurchaseIntentStoragePort, PurchaseIntentStorageResult } from '../../domain/purchase-intent/purchase-intent-storage.port';

interface TabStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
class PurchaseIntentStorageRecordKind {
  private constructor(readonly wire: 'ACTIVE' | 'RETIRED' | 'UNKNOWN') {}
  static readonly Active = Object.freeze(new PurchaseIntentStorageRecordKind('ACTIVE'));
  static readonly Retired = Object.freeze(new PurchaseIntentStorageRecordKind('RETIRED'));
  static readonly Unknown = Object.freeze(new PurchaseIntentStorageRecordKind('UNKNOWN'));
  static fromWire(raw: unknown): PurchaseIntentStorageRecordKind {
    return raw === this.Active.wire ? this.Active : raw === this.Retired.wire ? this.Retired : this.Unknown;
  }
}

export class SessionPurchaseIntentStorageAdapter implements PurchaseIntentStoragePort {
  static readonly key = 'storecore.purchase-intent.v1';
  constructor(private readonly storage: () => TabStorage | undefined = () => globalThis.sessionStorage) {}
  save(intent: PurchaseIntent): PurchaseIntentStorageResult {
    if (!intent.isKnown) return PurchaseIntentStorageResult.Unknown;
    try { const storage = this.storage(); if (!storage) return PurchaseIntentStorageResult.Unavailable;
      const current = this.readRecord(storage.getItem(SessionPurchaseIntentStorageAdapter.key));
      if (current.kind === PurchaseIntentStorageRecordKind.Retired && current.flowId === intent.flowId) return PurchaseIntentStorageResult.Retired;
      storage.setItem(SessionPurchaseIntentStorageAdapter.key, JSON.stringify({ kind: PurchaseIntentStorageRecordKind.Active.wire, intent: intent.toWire() }));
      return PurchaseIntentStorageResult.Saved;
    } catch { return PurchaseIntentStorageResult.Unavailable; }
  }
  load(now: number): PurchaseIntentLoad {
    try {
      const storage = this.storage(); if (!storage) return { intent: PurchaseIntent.Unknown, result: PurchaseIntentStorageResult.Unavailable };
      const raw = storage.getItem(SessionPurchaseIntentStorageAdapter.key);
      if (raw === null) return { intent: PurchaseIntent.Unknown, result: PurchaseIntentStorageResult.Empty };
      const record = this.readRecord(raw);
      if (record.kind === PurchaseIntentStorageRecordKind.Retired) return { intent: PurchaseIntent.Unknown, result: PurchaseIntentStorageResult.Cleared };
      const intent = record.kind === PurchaseIntentStorageRecordKind.Active ? PurchaseIntent.fromWire(record.intent, now) : PurchaseIntent.Unknown;
      if (!intent.isKnown) { storage.removeItem(SessionPurchaseIntentStorageAdapter.key); return { intent, result: PurchaseIntentStorageResult.Unknown }; }
      return { intent, result: PurchaseIntentStorageResult.Saved };
    } catch { return { intent: PurchaseIntent.Unknown, result: PurchaseIntentStorageResult.Unavailable }; }
  }
  clear(flowId: string): PurchaseIntentStorageResult {
    if (!validPurchaseFlowId(flowId)) return PurchaseIntentStorageResult.Unknown;
    try {
      const storage = this.storage(); if (!storage) return PurchaseIntentStorageResult.Unavailable;
      // The tombstone remains until an explicit action writes a different flow.
      storage.setItem(SessionPurchaseIntentStorageAdapter.key, JSON.stringify({ kind: PurchaseIntentStorageRecordKind.Retired.wire, flowId }));
      return PurchaseIntentStorageResult.Cleared;
    } catch {
      try { const storage = this.storage(); if (!storage) return PurchaseIntentStorageResult.Unavailable; storage.removeItem(SessionPurchaseIntentStorageAdapter.key); return PurchaseIntentStorageResult.EmergencyCleared; }
      catch { return PurchaseIntentStorageResult.Unavailable; }
    }
  }

  private readRecord(raw: string | null): { kind: PurchaseIntentStorageRecordKind; flowId: string; intent: unknown } {
    if (raw === null) return { kind: PurchaseIntentStorageRecordKind.Unknown, flowId: '', intent: null };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { kind: PurchaseIntentStorageRecordKind.Unknown, flowId: '', intent: null }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: PurchaseIntentStorageRecordKind.Unknown, flowId: '', intent: null };
    const row = parsed as Record<string, unknown>;
    const kind = PurchaseIntentStorageRecordKind.fromWire(row['kind']);
    // One fail-closed migration read for records written by the previous adapter.
    if (kind === PurchaseIntentStorageRecordKind.Unknown && Object.hasOwn(row, 'version')) {
      return { kind: PurchaseIntentStorageRecordKind.Active, flowId: '', intent: parsed };
    }
    if (kind === PurchaseIntentStorageRecordKind.Active && Object.keys(row).length === 2) return { kind, flowId: '', intent: row['intent'] };
    if (kind === PurchaseIntentStorageRecordKind.Retired && Object.keys(row).length === 2 && validPurchaseFlowId(row['flowId'])) {
      return { kind, flowId: row['flowId'], intent: null };
    }
    return { kind: PurchaseIntentStorageRecordKind.Unknown, flowId: '', intent: null };
  }
}
