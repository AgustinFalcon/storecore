import { Injectable } from '@angular/core';
import { AdjustAvailableStockCommand, ConfirmInventoryAdjustmentStep } from '../../domain/user/inventory-adjustment';
import { mapAdjustmentBalance } from '../../data/user/inventory-adjustment.mapper';
export interface InventoryAdjustmentAttempt { readonly version: 1; readonly actor: string; readonly epoch: string; readonly command: AdjustAvailableStockCommand; readonly sku: string; }
/** One tab-scoped frozen command; no credentials. Never replace an unresolved attempt. */
@Injectable({ providedIn: 'root' })
export class InventoryAdjustmentAttemptJournal {
  private readonly key = 'sc:inventory-adjustment:v1';
  read(actor: string, epoch: string): InventoryAdjustmentAttempt | null {
    const raw = sessionStorage.getItem(this.key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<InventoryAdjustmentAttempt>;
    if (value.actor !== actor || value.epoch !== epoch) { this.clear(); return null; }
    const command = value.command;
    const expected = mapAdjustmentBalance(command?.expected);
    if (value.version !== 1 || typeof value.sku !== 'string' || !command || !expected || typeof command.variantId !== 'string' || typeof command.reason !== 'string' || typeof command.quantityDelta !== 'number') throw new Error('El intento guardado no es válido.');
    const translated = new ConfirmInventoryAdjustmentStep().execute(command.variantId, expected, String(command.quantityDelta), command.reason, command.commandId);
    if (!translated || translated.reason !== command.reason) throw new Error('El intento guardado no es válido.');
    return { version: 1, actor, epoch, command: translated, sku: value.sku };
  }
  remember(attempt: InventoryAdjustmentAttempt): boolean {
    try {
      if (sessionStorage.getItem(this.key)) return false;
      const serialized = JSON.stringify(attempt); sessionStorage.setItem(this.key, serialized);
      return sessionStorage.getItem(this.key) === serialized;
    } catch { return false; }
  }
  clear(): boolean { try { sessionStorage.removeItem(this.key); return sessionStorage.getItem(this.key) === null; } catch { return false; } }
}
