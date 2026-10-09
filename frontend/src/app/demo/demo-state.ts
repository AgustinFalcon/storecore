import { Injectable, signal } from '@angular/core';
import { DemoCommerce, DemoContext, DemoScenario, decodeSnapshot, demoSeed } from './demo-model';

const STORAGE_KEY = 'storecore.commercial-demo.v1';
@Injectable({ providedIn: 'root' })
export class DemoApplicationState {
  readonly commerce = new DemoCommerce();
  readonly revision = signal(0);
  readonly context = signal(DemoContext.Unknown);
  readonly actorId = signal('cliente');
  readonly scenario = signal(DemoScenario.Approved);
  readonly message = signal('');
  readonly error = signal('');
  private persistedRevision = 0;
  constructor() {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) this.commerce.snapshot = decodeSnapshot(raw); this.persistedRevision = this.commerce.snapshot.revision; } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo leer la demo guardada.'); }
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) this.error.set('Los datos cambiaron en otra pestaña. Recargá antes de continuar.'); });
    const savedContext = DemoContext.fromWire(sessionStorage.getItem('storecore.demo.context'));
    const savedActor = sessionStorage.getItem('storecore.demo.actor') ?? 'cliente';
    if (this.commerce.snapshot.actors.some(actor => actor.id === savedActor)) { this.actorId.set(savedActor); this.context.set(savedContext); }
  }
  get data() { this.revision(); return this.commerce.snapshot; }
  get actor() { this.revision(); return this.commerce.actor(this.actorId()); }
  run(action: () => void, result: string): boolean {
    this.error.set(''); this.message.set('');
    const before = JSON.stringify(this.commerce.snapshot);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && decodeSnapshot(raw).revision !== this.persistedRevision) throw new Error('Los datos cambiaron en otra pestaña. Recargá antes de guardar.');
      action(); localStorage.setItem(STORAGE_KEY, JSON.stringify(this.commerce.snapshot)); this.persistedRevision = this.commerce.snapshot.revision;
      this.revision.update(value => value + 1); this.message.set(result); return true;
    } catch (error) { this.commerce.snapshot = decodeSnapshot(before); this.revision.update(value => value + 1); this.error.set(error instanceof Error ? error.message : 'No se pudo completar la operación.'); return false; }
  }
  login(context: DemoContext, actor = 'cliente'): void { this.actorId.set(actor); this.context.set(context); sessionStorage.setItem('storecore.demo.context', context.wire); sessionStorage.setItem('storecore.demo.actor', actor); this.error.set(''); }
  logout(): void { this.context.set(DemoContext.Unknown); sessionStorage.removeItem('storecore.demo.context'); sessionStorage.removeItem('storecore.demo.actor'); this.message.set('Sesión demo cerrada.'); }
  reset(): void { this.commerce.snapshot = demoSeed(); this.persistedRevision = 0; localStorage.removeItem(STORAGE_KEY); this.actorId.set('cliente'); this.logout(); this.scenario.set(DemoScenario.Approved); this.revision.update(value => value + 1); this.error.set(''); this.message.set('Demostración restablecida.'); }
}
