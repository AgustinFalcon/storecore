import { Injectable } from '@angular/core';

/** Stores only a non-secret recovery key; never stores inspection notes or identity tokens. */
@Injectable({ providedIn: 'root' })
export class ReturnDispositionAttempt {
  private storageKey(actor: string, returnId: string): string { return `sc:rma-disposition:${encodeURIComponent(actor)}:${encodeURIComponent(returnId)}`; }
  read(actor: string, returnId: string): string | null {
    try {
      const value = sessionStorage.getItem(this.storageKey(actor, returnId));
      return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
    } catch { return null; }
  }
  remember(actor: string, returnId: string, key: string): boolean {
    try { sessionStorage.setItem(this.storageKey(actor, returnId), key); return this.read(actor, returnId) === key; }
    catch { return false; }
  }
  clear(actor: string, returnId: string): void { try { sessionStorage.removeItem(this.storageKey(actor, returnId)); } catch { /* Browser storage may be unavailable. */ } }
  clearActor(actor: string): void {
    try {
      const prefix = `sc:rma-disposition:${encodeURIComponent(actor)}:`;
      for (let index = sessionStorage.length - 1; index >= 0; index--) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
      }
    } catch { /* Browser storage may be unavailable. */ }
  }
}
