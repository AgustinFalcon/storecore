import { Injectable } from '@angular/core';
import { CapabilityStateIntent } from '../../domain/user/capability-state-intent';

export interface CapabilityCommandRecovery { readonly locked: boolean; readonly intent: CapabilityStateIntent | null; }

/** Session-scoped fence. A pending command is conservatively uncertain after recreation. */
@Injectable({ providedIn: 'root' })
export class CapabilityCommandJournal {
  private readonly key = 'storecore.capability-command.v1';

  recover(epoch: string): CapabilityCommandRecovery {
    try {
      const raw = sessionStorage.getItem(this.key);
      if (raw === null) return { locked: false, intent: null };
      const record: unknown = JSON.parse(raw);
      if (!record || typeof record !== 'object' || Array.isArray(record)) return this.retainMalformedFence(epoch);
      const value = record as Record<string, unknown>;
      if (typeof value['epoch'] === 'string' && value['epoch'] !== epoch) {
        sessionStorage.removeItem(this.key);
        return { locked: false, intent: null };
      }
      if (value['epoch'] !== epoch || value['version'] !== 1 || Object.keys(value).sort().join(',') !== 'epoch,intent,version') return this.retainMalformedFence(epoch);
      const intent = CapabilityStateIntent.fromWire(value['intent']);
      return { locked: true, intent: intent === CapabilityStateIntent.Unknown ? null : intent };
    } catch { return this.retainMalformedFence(epoch); }
  }

  begin(epoch: string, intent: CapabilityStateIntent): boolean {
    if (this.recover(epoch).locked) return false;
    try {
      sessionStorage.setItem(this.key, JSON.stringify({ version: 1, epoch, intent: intent.toWire() }));
      return this.recover(epoch).intent?.correlationId === intent.correlationId;
    } catch { return false; }
  }

  release(epoch: string, intent: CapabilityStateIntent): void {
    try {
      const raw = sessionStorage.getItem(this.key);
      if (raw === null) return;
      const record = JSON.parse(raw) as Record<string, unknown>;
      if (record?.['epoch'] !== epoch || CapabilityStateIntent.fromWire(record['intent']).correlationId !== intent.correlationId) return;
      sessionStorage.removeItem(this.key);
    } catch { /* Retain a conservative fence if storage is unavailable. */ }
  }

  private retainMalformedFence(epoch: string): CapabilityCommandRecovery {
    try { sessionStorage.setItem(this.key, JSON.stringify({ version: 1, epoch, intent: null })); }
    catch { /* Storage unavailable remains fail-closed for every attempted epoch. */ }
    return { locked: true, intent: null };
  }
}
